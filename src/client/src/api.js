const API_BASE = ''

export async function getPilots() {
  const response = await fetch(`${API_BASE}/api/pilots`)
  if (!response.ok) throw new Error('Erreur récupération pilotes')
  return response.json()
}

export async function getConfig() {
  const response = await fetch(`${API_BASE}/api/config`)
  if (!response.ok) throw new Error('Erreur récupération config')
  return response.json()
}

export async function setLastPilot(pilotId) {
  const response = await fetch(`${API_BASE}/api/config/last-pilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pilotId })
  })
  if (!response.ok) throw new Error('Erreur sauvegarde pilote')
  return response.json()
}

export async function getBattery() {
  const response = await fetch(`${API_BASE}/api/battery`)
  if (!response.ok) throw new Error('Erreur batterie')
  return response.json()
}

export async function getVideos() {
  const response = await fetch(`${API_BASE}/api/videos`)
  if (!response.ok) throw new Error('Erreur vidéos')
  return response.json()
}

export async function getStreamUrl(pilotKey) {
  return `${API_BASE}/live/${pilotKey}.flv`
}

export async function getWebRTCLUrl(pilotKey) {
  return `${API_BASE}/stream/${pilotKey}`
}
