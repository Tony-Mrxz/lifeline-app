'use client';

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from './SosButton.module.css';

const TARGET_ROLES = ['doctor', 'medical intern', 'ambulance driver'];

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function blobToBase64Parts(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const [header, data] = dataUrl.split(',');
      const mimeType = header.match(/data:(.*);/)[1];
      resolve({ mimeType, data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function SosButton() {
  const [enabled, setEnabled] = useState(false);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [micError, setMicError] = useState(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [transcriptionError, setTranscriptionError] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const locationRef = useRef(null);
  const secondsRef = useRef(0);
  const alertIdRef = useRef(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setSeconds((prev) => {
        secondsRef.current = prev + 1;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  const sendAlert = async (audioBlob) => {
    const t0 = Date.now();
    console.log('[sos] send started');
    setSending(true);
    setSendError(null);
    let alertRef = null;
    try {
      const { mimeType, data } = await blobToBase64Parts(audioBlob);

      let senderRole = 'unknown';
      let senderEmail = null;
      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          senderRole = snap.data().role ?? 'unknown';
          senderEmail = snap.data().email ?? null;
        }
      }

      alertRef = await addDoc(collection(db, 'sos_alerts'), {
        senderUid: user?.uid ?? null,
        senderEmail,
        senderRole,
        targetRoles: TARGET_ROLES,
        lat: locationRef.current?.lat ?? null,
        lng: locationRef.current?.lng ?? null,
        transcript: null,
        transcriptionStatus: 'pending',
        audioBase64: `data:${mimeType};base64,${data}`,
        durationSeconds: secondsRef.current,
        status: cancelRequestedRef.current ? 'cancelled' : 'open',
        createdAt: new Date().toISOString(),
      });
      alertIdRef.current = alertRef.id;
      console.log(`[sos] alert live for responders in ${Date.now() - t0}ms`);

      setTranscript('');
      setTranscriptionError(null);
      setSent(true);
      setSending(false);

      if (cancelRequestedRef.current) {
        await updateDoc(alertRef, {
          transcriptionStatus: 'skipped',
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
        });
        return;
      }

      // alert is live for responders now; transcription patches it when ready
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: data, mimeType }),
        });
        const json = await res.json();
        console.log(`[sos] transcription responded in ${Date.now() - t0}ms (status ${res.status})`);
        if (res.ok) {
          setTranscript(json.transcript);
          await updateDoc(alertRef, {
            transcript: json.transcript,
            transcriptionStatus: 'done',
          });
        } else {
          setTranscriptionError(json.error);
          await updateDoc(alertRef, {
            transcriptionError: json.error,
            transcriptionStatus: 'failed',
          });
        }
      } catch (err) {
        setTranscriptionError(err.message);
        await updateDoc(alertRef, {
          transcriptionError: err.message,
          transcriptionStatus: 'failed',
        });
      }
    } catch (err) {
      setSendError(err.message);
      if (alertRef) {
        await updateDoc(alertRef, {
          transcriptionError: err.message,
          transcriptionStatus: 'failed',
        });
      }
    } finally {
      setSending(false);
    }
  };

  const requestGps = () => {
    if (!('geolocation' in navigator)) {
      setError('GPS not supported in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locationRef.current = coords;
        setLocation(coords);
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startCapture = async () => {
    setTranscript('');
    setMicError(null);
    setSent(false);
    setSendError(null);
    setTranscriptionError(null);
    secondsRef.current = 0;
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 24000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        sendAlert(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMicError('microphone permission denied');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setRecording(false);
  };

  const handleClick = () => {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      locationRef.current = null;
      setLocation(null);
      setError(null);
      alertIdRef.current = null;
      cancelRequestedRef.current = false;
      requestGps();
      startCapture();
    } else {
      cancelRequestedRef.current = true;
      stopRecording();
      if (alertIdRef.current) {
        updateDoc(doc(db, 'sos_alerts', alertIdRef.current), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
        });
      }
    }
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.sos} ${enabled ? styles.active : ''}`}
        aria-label="Emergency SOS"
        aria-pressed={enabled}
        onClick={handleClick}
      >
        <span className={styles.ring} aria-hidden="true" />
        <span className={styles.label}>SOS</span>
      </button>

      {enabled && location && (
        <p className={styles.status}>
          GPS locked: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </p>
      )}
      {enabled && error && <p className={styles.error}>GPS: {error}</p>}
      {enabled && micError && <p className={styles.error}>Mic: {micError}</p>}

      {enabled && recording && (
        <>
          <div className={styles.recRow}>
            <span className={styles.recDot} aria-hidden="true" />
            <span className={styles.recTime}>Recording… {formatTime(seconds)}</span>
          </div>
          <button type="button" className={styles.stopBtn} onClick={stopRecording}>
            Stop & send
          </button>
        </>
      )}

      {enabled && !recording && sending && (
        <div className={styles.recRow}>
          <span className={styles.recDot} aria-hidden="true" />
          <span className={styles.recTime}>Sending alert…</span>
        </div>
      )}
      {enabled && !recording && sent && (
        <p className={styles.sentMsg}>Sent to doctors, interns & ambulances ✓</p>
      )}
      {enabled && !recording && sendError && (
        <p className={styles.error}>Send failed: {sendError}</p>
      )}
      {enabled && sent && transcriptionError && (
        <p className={styles.error}>Transcription failed: {transcriptionError}</p>
      )}

      {enabled && sent && transcript && (
        <p className={styles.transcript}>"{transcript}"</p>
      )}
    </div>
  );
}
