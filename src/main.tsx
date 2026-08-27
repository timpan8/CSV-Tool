import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/grid.css'
import './styles/dialog.css'
import './styles/verkstad.css'
import './styles/kombinera.css'
import { App } from './ui/App.jsx'
import { applyAppearance } from './state/store.js'

applyAppearance()

const root = document.getElementById('app')
if (!root) throw new Error('Hittade inte #app i dokumentet.')
render(<App />, root)
