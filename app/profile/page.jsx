import Navbar from '../../components/Navbar';
import ProfileCard from '../../components/ProfileCard';
import RequireAuth from '../../components/RequireAuth';

export default function Profile() {
  return (
    <RequireAuth>
      <div className="shell">
        <Navbar />
        <main className="page">
          <ProfileCard />
        </main>
      </div>
    </RequireAuth>
  );
}
