import Hls from 'hls.js'
import { useEffect, useRef } from 'react'

const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const MAX_RETRIES = 10
const MAX_BUFFER_LAG_SECONDS = 1.5

function StreamPlayer({ streamUrl, onStatusChange }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef(null)
  const bufferCheckIntervalRef = useRef(null)

  useEffect(() => {
    const videoElement = videoRef.current
    let destroyed = false

    const cleanupHls = () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy()
        } catch (e) {
          console.warn('Cleanup HLS error:', e)
        }
        hlsRef.current = null
      }
    }

    const scheduleRetry = () => {
      if (destroyed) return
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(
          BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current),
          MAX_RETRY_DELAY_MS
        )
        retryCountRef.current++
        console.log(`Reconnexion HLS dans ${delay}ms (${retryCountRef.current}/${MAX_RETRIES})`)
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          if (!destroyed) createPlayer()
        }, delay)
      }
    }

    const createPlayer = () => {
      cleanupHls()
      if (destroyed) return

      // Native HLS support (Safari)
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = streamUrl
        videoElement.load()
        videoElement.play().catch(() => {
          console.log('Autoplay bloqué, interaction utilisateur requise')
        })
        return
      }

      if (!Hls.isSupported()) {
        console.error('HLS.js non supporté sur ce navigateur')
        onStatusChange('error')
        return
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 0,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        maxBufferSize: 10 * 1000 * 1000,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        maxFragLookUpTolerance: 0.2,
        // Reduce stalls / latency for live streams
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 20000,
      })

      hls.loadSource(streamUrl)
      hls.attachMedia(videoElement)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retryCountRef.current = 0
        onStatusChange('connected')
        videoElement.play().catch(() => {
          console.log('Autoplay bloqué, interaction utilisateur requise')
        })
      })

      // Listen for buffer events that cause stalls
      hls.on(Hls.Events.BUFFER_EOS, () => {
        console.warn('HLS: end of buffer, attempting recovery')
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        // Ignore bufferStalled errors, let HLS recover
        if (data.details === 'bufferStalledError') return
        console.error('Erreur HLS:', data.type, data.details, data)
        if (data.fatal) {
          onStatusChange('error')
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Erreur réseau HLS, tentative de recovery...')
              hls.startLoad()
              scheduleRetry()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Erreur média HLS, tentative de recoverMediaError...')
              hls.recoverMediaError()
              scheduleRetry()
              break
            default:
              hls.destroy()
              scheduleRetry()
              break
          }
        }
      })

      hlsRef.current = hls
    }

    // Native HLS events for Safari path
    const onLoadedMetadata = () => {
      retryCountRef.current = 0
      onStatusChange('connected')
    }
    const onError = () => {
      console.error('Erreur vidéo native')
      onStatusChange('error')
      scheduleRetry()
    }

    if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.addEventListener('loadedmetadata', onLoadedMetadata)
      videoElement.addEventListener('error', onError)
    }

    createPlayer()

    bufferCheckIntervalRef.current = setInterval(() => {
      if (videoElement.buffered.length > 0 && !videoElement.paused) {
        const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1)
        const currentTime = videoElement.currentTime
        const lag = bufferedEnd - currentTime
        if (lag > MAX_BUFFER_LAG_SECONDS) {
          console.warn(`Buffer lag vérifié: ${lag.toFixed(2)}s, saut au live`)
          videoElement.currentTime = bufferedEnd - 0.2
        }
      }
    }, 1000)

    return () => {
      destroyed = true
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (bufferCheckIntervalRef.current) clearInterval(bufferCheckIntervalRef.current)
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.removeEventListener('loadedmetadata', onLoadedMetadata)
        videoElement.removeEventListener('error', onError)
        videoElement.removeAttribute('src')
        videoElement.load()
      }
      cleanupHls()
    }
  }, [streamUrl, onStatusChange])

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
