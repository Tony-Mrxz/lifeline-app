import Navbar from '../../components/Navbar';
import SosButton from '../../components/SosButton';
import AlertInbox from '../../components/AlertInbox';
import ResponderBackground from '../../components/ResponderBackground';

export default function Dashboard() {
  return (
    <div className="shell">
      <ResponderBackground />
      <Navbar />
      <main className="page">
        <SosButton />
      </main>
      <AlertInbox />
    </div>
  );
}
