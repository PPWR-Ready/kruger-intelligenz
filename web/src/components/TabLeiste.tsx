import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'

export function TabLeiste() {
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <nav className="tableiste" aria-label="Hauptnavigation">
      <NavLink to="/heute" className={tab}><Icon name="heute" />Heute</NavLink>
      <NavLink to="/assistent" className={tab}><Icon name="chat" />Assistent</NavLink>
      <NavLink to="/trainieren" className="tab-kamera" aria-label="Trainieren mit Kamera"><Icon name="kamera" groesse={26} staerke={2} /></NavLink>
      <NavLink to="/fortschritt" className={tab}><Icon name="fortschritt" />Fortschritt</NavLink>
      <NavLink to="/profil" className={tab}><Icon name="profil" />Profil</NavLink>
    </nav>
  )
}
