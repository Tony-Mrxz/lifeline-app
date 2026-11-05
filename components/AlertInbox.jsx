'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from './AlertInbox.module.css';

// leaflet touches window at import time — keep it out of the server render
const SosMapView = dynamic(() => import('./SosMapView'), { ssr: false });

const RESPONDER_ROLES = ['doctor', 'medical intern', 'ambulance driver', 'ride accompany'];
const ALERT_TTL_MS = 5 * 60 * 1000; // alerts auto-expire from popups after 5 min

// three independent lanes: medical (doctors + interns), ambulance, rider
function laneField(responderRole) {
  if (responderRole === 'ambulance driver') return 'ambulanceAcceptedBy';
  if (responderRole === 'ride accompany') return 'riderAcceptedBy';
  return 'medicalAcceptedBy';
}

const LANE_LABEL = {
  doctor: 'Doctor',
  'medical intern': 'Medical intern',
  'ambulance driver': 'Ambulance',
  'ride accompany': 'Rider',
};

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function AlertInbox() {
  const [me, setMe] = useState(null);
  const [role, setRole] = useState(null);
  const [phone, setPhone] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe(null);
        setRole(null);
        setPhone(null);
        return;
      }
      setMe({ uid: user.uid, email: user.email });
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        console.log(
          `[alert] logged in as ${user.email}, role: ${data.role ?? 'NONE (users doc missing)'}`
        );
        setRole(data.role ?? null);
        setPhone(data.phone ?? null);
      } catch (err) {
        console.log('[alert] role lookup failed:', err.message);
        setRole(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!role || !RESPONDER_ROLES.includes(role)) return;
    const q = query(
      collection(db, 'sos_alerts'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.log('[alert] snapshot error:', err.message)
    );
    return () => unsub();
  }, [role]);

  const lane = role ? laneField(role) : null;

  const visible =
    me && role && RESPONDER_ROLES.includes(role)
      ? alerts.filter(
          (a) =>
            (a.targetRoles ?? []).includes(role) &&
            !(a.declinedBy ?? []).includes(me.uid) &&
            (a.status === 'open' || a.status === 'accepted') &&
            // my own lane must not already be taken by someone else
            (a[lane] == null || a[lane].uid === me.uid) &&
            Date.now() - new Date(a.createdAt).getTime() < ALERT_TTL_MS
        )
      : [];
  // query is newest-first; work the OLDEST actionable alert first
  const current = visible.length ? visible[visible.length - 1] : null;

  const lastSeenIdRef = useRef(null);

  useEffect(() => {
    const id = current?.id ?? null;
    if (id === lastSeenIdRef.current) return;
    if (id) {
      console.log(
        `[alert] received SOS from ${current.senderEmail ?? 'unknown'} (${current.senderRole}) — ${current.durationSeconds ?? '?'}s audio, transcript: ${current.transcriptionStatus ?? 'n/a'}`
      );
    } else if (lastSeenIdRef.current) {
      console.log('[alert] alert cleared — cancelled, handled, or declined');
    }
    lastSeenIdRef.current = id;
  }, [current]);

  const notifiedIdRef = useRef(null);

  useEffect(() => {
    const id = current?.id;
    if (!id || id === notifiedIdRef.current) return;
    notifiedIdRef.current = id;
    // the sheet itself is the alert when the tab is in front
    if (document.hasFocus() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification('Incoming SOS — Life Line', {
      body: `${current.senderEmail ?? 'unknown'} (${current.senderRole}) · ${current.durationSeconds ?? '?'}s audio`,
      icon: '/logo.png',
      tag: `sos-${id}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, [current]);

  if (!me || !role || !RESPONDER_ROLES.includes(role)) return null;

  if (!current) return null;

  const myLaneTaken = current[lane]?.uid === me.uid;
  const isAmbulance = role === 'ambulance driver';
  const isRider = role === 'ride accompany';
  const medicalLead = current.medicalAcceptedBy ?? null;
  const ambulanceLead = current.ambulanceAcceptedBy ?? null;

  const accept = async () => {
    console.log(`[alert] accepted SOS from ${current.senderEmail} as ${lane}`);
    await updateDoc(doc(db, 'sos_alerts', current.id), {
      status: 'accepted',
      [lane]: {
        uid: me.uid,
        name: me.email,
        role,
        phone,
        acceptedAt: new Date().toISOString(),
      },
    });
  };

  const decline = async () => {
    console.log(`[alert] declined SOS from ${current.senderEmail}`);
    await updateDoc(doc(db, 'sos_alerts', current.id), {
      declinedBy: arrayUnion(me.uid),
    });
  };

  return (
    <div className={styles.sheet}>
      <div className={styles.header}>
        <span className={styles.badge}>INCOMING SOS</span>
        {visible.length > 1 && (
          <span className={styles.count}>{visible.length} active</span>
        )}
        <span className={styles.age}>{timeAgo(current.createdAt)}</span>
        <span className={styles.from}>
          {current.senderEmail ?? 'unknown'} · {current.senderRole}
        </span>
      </div>

      {/* Severity triage pill — shown as soon as Gemini patches the alert */}
      {current.severity ? (
        <div className={`${styles.severityRow} ${styles[`severity_${current.severity}`]}`}>
          <span className={styles.severityPill}>
            {current.severity === 'critical' && '🔴 CRITICAL'}
            {current.severity === 'moderate' && '🟠 MODERATE'}
            {current.severity === 'stable'   && '🟢 STABLE'}
          </span>
          {current.severityReason && (
            <span className={styles.severityReason}>{current.severityReason}</span>
          )}
        </div>
      ) : current.transcriptionStatus === 'pending' ? (
        <div className={styles.severityPending}>⏳ AI triage in progress…</div>
      ) : null}

      <audio controls src={current.audioBase64} className={styles.audio} />

      <p className={styles.transcript}>
        {current.transcript
          ? `"${current.transcript}"`
          : current.transcriptionStatus === 'pending'
            ? 'Transcribing…'
            : 'No transcription available'}
      </p>

      {current.lat != null && current.lng != null && (
        <>
          <div className={styles.mapWrap}>
            <SosMapView lat={current.lat} lng={current.lng} />
          </div>
          <p className={styles.coords}>
            {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
          </p>
        </>
      )}

      {myLaneTaken ? (
        <p className={styles.handledMe}>
          You accepted this alert as {LANE_LABEL[role]}
        </p>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.acceptBtn} onClick={accept}>
            Accept as {LANE_LABEL[role]}
          </button>
          <button type="button" className={styles.declineBtn} onClick={decline}>
            Decline
          </button>
        </div>
      )}

      {(!isAmbulance && ambulanceLead) || (isRider && medicalLead) ? (
        <div className={styles.leadRow}>
          <span className={styles.leadLabel}>
            {isAmbulance
              ? `Ambulance assigned: ${ambulanceLead.name}`
              : `Case in-charge: ${medicalLead.name} (${medicalLead.role})`}
          </span>
          {isAmbulance
            ? ambulanceLead.phone && (
                <a className={styles.contactBtn} href={`tel:${ambulanceLead.phone}`}>
                  Contact
                </a>
              )
            : medicalLead.phone && (
                <a className={styles.contactBtn} href={`tel:${medicalLead.phone}`}>
                  Contact
                </a>
              )}
        </div>
      ) : (
        <p className={styles.leadPending}>
          {isAmbulance
            ? 'Waiting for a doctor/intern to take case in-charge…'
            : isRider
              ? 'Waiting for the case in-charge…'
              : 'Waiting for an ambulance to be assigned…'}
        </p>
      )}
    </div>
  );
}
