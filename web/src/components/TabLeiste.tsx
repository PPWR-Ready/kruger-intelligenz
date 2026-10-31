import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'

/** Hauptnavigation: Chat ist die Startseite, Training mit Kamera sitzt hervorgehoben in der Mitte. */
export function TabLeiste() {
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <nav className="tableiste" aria-label="Hauptnavigation">
      <NavLink to="/assistent" className={tab}><Icon name="chat" />Chat</NavLink>
      <NavLink to="/heute" className={tab}><Icon name="heute" />Heute</NavLink>
      <NavLink to="/trainieren" className={({ isActive }) => (isActive ? 'tab-kamera-platz active' : 'tab-kamera-platz')}>
        <span className="tab-kamera"><Icon name="kamera" groesse={25} staerke={2} /></span>Training
      </NavLink>
      <NavLink to="/fortschritt" className={tab}><Icon name="fortschritt" />Fortschritt</NavLink>
      <NavLink to="/profil" className={tab}><Icon name="profil" />Profil</NavLink>
    </nav>
  )
}
