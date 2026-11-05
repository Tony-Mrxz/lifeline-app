import Link from 'next/link';
import Image from 'next/image';
import styles from './Navbar.module.css';

export default function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.brand}>
        <Image src="/logo.png" alt="Life Line logo" width={32} height={32} className={styles.logo} priority />
        <span className={styles.title}>Life Line</span>
      </div>
      <div className={styles.right}>
        <Link href="/profile" className={styles.profileBtn}>
          Profile
        </Link>
        <span className={styles.pill}>demo</span>
      </div>
    </header>
  );
}
