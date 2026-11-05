import Navbar from '../../components/Navbar';
import SosButton from '../../components/SosButton';
import AlertInbox from '../../components/AlertInbox';
import ResponderBackground from '../../components/ResponderBackground';
import RequireAuth from '../../components/RequireAuth';

export default function Dashboard() {
  return (
    <RequireAuth>
      <div className="shell">
        <ResponderBackground />
        <Navbar />
        <main className="page">
          <SosButton />
        </main>
        <AlertInbox />
      </div>
    </RequireAuth>
  );
}
