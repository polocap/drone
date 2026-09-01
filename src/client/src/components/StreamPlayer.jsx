import Hls from 'hls.js'
import { useEffect, useRef } from 'react'

const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const MAX_RETRIES = 10

// --- WebRTC (WHEP) helpers ---
function getWhepUrl() {
  const host = window.location.hostname || '10.0.0.1'
  return `http://${host}:8889/live/whep`
}

async function startWebRTC(videoEl, onStatusChange, signal) {
  const pc = new RTCPeerConnection({
    iceServers: [],
    bundlePolicy: 'max-bundle',
  })

  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      videoEl.srcObject = event.streams[0]
    } else {
      const ms = new MediaStream([event.track])
      videoEl.srcObject = ms
    }
    onStatusChange('connected')
    videoEl.play().catch(() => {})
  }

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      onStatusChange('error')
    } else if (state === 'connected') {
      onStatusChange('connected')
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const check = setInterval(() => {
      if (pc.iceGatheringState === 'complete') {
        clearInterval(check)
        resolve()
      }
    }, 100)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearInterval(check)
        resolve()
      }
    })
    setTimeout(() => {
      clearInterval(check)
      resolve()
    }, 1500)
  })

  if (signal.aborted) {
    pc.close()
    throw new Error('aborted')
  }

  const url = getWhepUrl()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription.sdp,
    signal,
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    pc.close()
    throw new Error(`WHEP ${res.status} ${txt}`)
  }

  const answerSdp = await res.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  return pc
}

// --- HLS fallback ---
function createHlsPlayer(videoEl, streamUrl, onStatusChange, signal, retryFn) {
  if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = streamUrl
    videoEl.load()
    videoEl.play().catch(() => {})
    return {
      destroy() {
        videoEl.removeAttribute('src')
        videoEl.load()
      },
    }
  }

  if (!Hls.isSupported()) {
    throw new Error('HLS not supported')
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 0,
    maxBufferLength: 1.5,
    maxMaxBufferLength: 3,
    maxBufferSize: 8 * 1000 * 1000,
    liveSyncDurationCount: 1.5,
    liveMaxLatencyDurationCount: 3,
    liveDurationInfinity: true,
    highBufferWatchdogPeriod: 0.5,
    nudgeOffset: 0.05,
    nudgeMaxRetry: 5,
    maxFragLookUpTolerance: 0.1,
    manifestLoadingTimeOut: 8000,
    manifestLoadingMaxRetry: 6,
    levelLoadingTimeOut: 8000,
    fragLoadingTimeOut: 15000,
  })

  hls.loadSource(streamUrl)
  hls.attachMedia(videoEl)

  const onManifest = () => {
    onStatusChange('connected')
    videoEl.play().catch(() => {})
  }
  const onError = (event, data) => {
    if (data.details === 'bufferStalledError') return
    if (data.fatal) {
      onStatusChange('error')
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      retryFn()
    }
  }

  hls.on(Hls.Events.MANIFEST_PARSED, onManifest)
  hls.on(Hls.Events.ERROR, onError)

  signal.addEventListener('abort', () => hls.destroy())

  return {
    destroy() {
      hls.off(Hls.Events.MANIFEST_PARSED, onManifest)
      hls.off(Hls.Events.ERROR, onError)
      hls.destroy()
    },
  }
}

function StreamPlayer({ streamUrl, onStatusChange }) {
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const hlsRef = useRef(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef(null)
  const abortRef = useRef(null)
  const onStatusChangeRef = useRef(onStatusChange)

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    const videoEl = videoRef.current
    let destroyed = false
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    const notify = (s) => onStatusChangeRef.current(s)

    const cleanup = () => {
      if (pcRef.current) {
        try { pcRef.current.close() } catch {}
        pcRef.current = null
      }
      if (hlsRef.current) {
        try { hlsRef.current.destroy() } catch {}
        hlsRef.current = null
      }
      if (videoEl) {
        videoEl.pause()
        videoEl.srcObject = null
        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.removeAttribute('src')
          try { videoEl.load() } catch {}
        }
      }
    }

    const scheduleRetry = () => {
      if (destroyed || signal.aborted) return
      if (retryCountRef.current >= MAX_RETRIES) return
      const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current), MAX_RETRY_DELAY_MS)
      retryCountRef.current += 1
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = setTimeout(() => {
        if (!destroyed) start()
      }, delay)
    }

    const startHls = () => {
      try {
        const hlsCtrl = createHlsPlayer(videoEl, streamUrl, notify, signal, scheduleRetry)
        hlsRef.current = hlsCtrl
        retryCountRef.current = 0
      } catch (e) {
        console.error('HLS fallback failed', e)
        notify('error')
        scheduleRetry()
      }
    }

    const start = async () => {
      cleanup()
      if (destroyed || signal.aborted) return

      try {
        const pc = await startWebRTC(videoEl, notify, signal)
        if (destroyed || signal.aborted) {
          pc.close()
          return
        }
        pcRef.current = pc
        retryCountRef.current = 0
        setTimeout(() => {
          if (!destroyed && !videoEl.srcObject && pcRef.current === pc) {
            console.warn('WebRTC no track after 4s, falling back to HLS')
            try { pc.close() } catch {}
            pcRef.current = null
            startHls()
          }
        }, 4000)
      } catch (e) {
        if (signal.aborted) return
        console.warn('WebRTC failed, falling back to HLS:', e.message || e)
        startHls()
      }
    }

    const onLoadedMetadata = () => {
      retryCountRef.current = 0
      notify('connected')
    }
    const onErrorNative = () => {
      notify('error')
      scheduleRetry()
    }

    const canNative = videoEl.canPlayType('application/vnd.apple.mpegurl')
    if (canNative) {
      videoEl.addEventListener('loadedmetadata', onLoadedMetadata)
      videoEl.addEventListener('error', onErrorNative)
    }

    start()

    return () => {
      destroyed = true
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (abortRef.current) abortRef.current.abort()
      if (canNative) {
        videoEl.removeEventListener('loadedmetadata', onLoadedMetadata)
        videoEl.removeEventListener('error', onErrorNative)
      }
      cleanup()
    }
    // Only restart when streamUrl changes — NOT when parent re-renders (clock tick)
  }, [streamUrl])

  return (
    <video
      ref={videoRef}
      className="stream-video"
      autoPlay
      muted
      playsInline
      controls={false}
    />
  )
}

export default StreamPlayer
