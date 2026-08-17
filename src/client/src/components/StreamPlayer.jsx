import flvjs from 'flv.js'
import { useEffect, useRef } from 'react'

const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const MAX_RETRIES = 10

function StreamPlayer({ streamUrl, onStatusChange }) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef(null)

  useEffect(() => {
    if (!flvjs.isSupported()) {
      console.error('FLV.js non supporté')
      return
    }

    const videoElement = videoRef.current
    
    const createPlayer = () => {
      if (playerRef.current) {
        try {
          playerRef.current.pause()
          playerRef.current.unload()
          playerRef.current.detachMediaElement()
          playerRef.current.destroy()
        } catch (e) {
          console.warn('Cleanup player error:', e)
        }
      }

      const flvPlayer = flvjs.createPlayer({
        type: 'flv',
        url: streamUrl,
        isLive: true,
        hasAudio: true,
        hasVideo: true,
        cors: true,
        enableWorker: true,
        enableStashBuffer: false,
        stashInitialSize: 128,
        lazyLoad: false,
        lazyLoadMaxDuration: 0,
        seekType: 'range'
      }, {
        enableWorker: true,
        enableStashBuffer: false,
        stashInitialSize: 128
      })

      flvPlayer.attachMediaElement(videoElement)
      flvPlayer.load()

      flvPlayer.on(flvjs.Events.METADATA_ARRIVED, () => {
        retryCountRef.current = 0
        onStatusChange('connected')
      })

      flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
        console.error('Erreur lecteur FLV:', errorType, errorDetail)
        onStatusChange('error')
        
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = Math.min(
            BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current),
            MAX_RETRY_DELAY_MS
          )
          retryCountRef.current++
          
          console.log(`Reconnexion dans ${delay}ms (${retryCountRef.current}/${MAX_RETRIES})`)
          
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current)
          }
          
          retryTimeoutRef.current = setTimeout(() => {
            try {
              createPlayer()
              videoElement.play().catch(() => {})
            } catch (e) {
              console.error('Reconnexion échouée:', e)
            }
          }, delay)
        }
      })

      playerRef.current = flvPlayer

      videoElement.play().catch(e => {
        console.log('Autoplay bloqué, interaction utilisateur requise')
      })
    }

    createPlayer()

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (playerRef.current) {
        try {
          playerRef.current.pause()
          playerRef.current.unload()
          playerRef.current.detachMediaElement()
          playerRef.current.destroy()
        } catch (e) {
          console.warn('Cleanup error:', e)
        }
        playerRef.current = null
      }
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
