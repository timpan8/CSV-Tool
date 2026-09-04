import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/grid.css'
import './styles/dialog.css'
import './styles/verkstad.css'
import './styles/kombinera.css'
import './styles/slaihop.css'
import { App } from './ui/App.jsx'
import { applyAppearance } from './state/store.js'
import { tillampaSprak } from './ui/sprak.js'

applyAppearance()
// `lang` på dokumentet från start, så att skärmläsaren och webbläsarens egen
// stavningskontroll vet vilket språk sidan är på innan något ritats.
tillampaSprak()

const root = document.getElementById('app')
if (!root) throw new Error('Hittade inte #app i dokumentet.')
render(<App />, root)
