import flvjs from 'flv.js'
import { useEffect, useRef } from 'react'

function StreamPlayer({ streamUrl, onStatusChange }) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!flvjs.isSupported()) {
      console.error('FLV.js non supporté')
      return
    }

    const videoElement = videoRef.current
    const flvPlayer = flvjs.createPlayer({
      type: 'flv',
      url: streamUrl,
      isLive: true,
      hasAudio: true,
      hasVideo: true,
      cors: true
    })

    flvPlayer.attachMediaElement(videoElement)
    flvPlayer.load()

    flvPlayer.on(flvjs.Events.METADATA_ARRIVED, () => {
      onStatusChange('connected')
    })

    flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
      console.error('Erreur lecteur FLV:', errorType, errorDetail)
      onStatusChange('error')
      
      setTimeout(() => {
        try {
          flvPlayer.unload()
          flvPlayer.load()
          flvPlayer.play()
        } catch (e) {
          console.error('Reconnexion échouée:', e)
        }
      }, 3000)
    })

    playerRef.current = flvPlayer

    videoElement.play().catch(e => {
      console.log('Autoplay bloqué, interaction utilisateur requise')
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.pause()
        playerRef.current.unload()
        playerRef.current.detachMediaElement()
        playerRef.current.destroy()
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
