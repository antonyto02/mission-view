import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-mono/300.css'
import '@fontsource/ibm-plex-mono/400.css'
import './styles.css'
import App from './App'

// No StrictMode: drei <Html> labels mount their own React roots and the
// double-mount in dev drops some of them under React 19.
createRoot(document.getElementById('root')!).render(<App />)
