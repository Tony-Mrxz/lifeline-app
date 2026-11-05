'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const RESPONDER_ROLES = ['doctor', 'medical intern', 'ambulance driver'];

export default function ResponderBackground() {
  const [isResponder, setIsResponder] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsResponder(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setIsResponder(
          snap.exists() && RESPONDER_ROLES.includes(snap.data().role)
        );
      } catch {
        setIsResponder(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    document.body.style.background = isResponder ? '#dc2626' : '';
    return () => {
      document.body.style.background = '';
    };
  }, [isResponder]);

  return null;
}
