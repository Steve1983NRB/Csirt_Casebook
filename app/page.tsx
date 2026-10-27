import Casebook from './casebook';
import {AuthGate} from './auth-gate';
export default function Home(){return <AuthGate><Casebook/></AuthGate>}
