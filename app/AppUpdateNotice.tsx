'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { shouldNotifyAboutVersion } from '@/lib/app-version';
import { apiRequest } from '@/lib/client-api.mjs';

export default function AppUpdateNotice({ appVersion }: { appVersion: string }) {
  const [latestVersion, setLatestVersion] = useState('');
  const [dismissedVersion, setDismissedVersion] = useState('');

  useEffect(() => {
    if (appVersion === 'development') return;

    let active = true;
    let checking = false;
    async function checkVersion() {
      if (checking || document.visibilityState !== 'visible') return;

      checking = true;
      try {
        const result = await apiRequest('version');
        if (active && typeof result?.version === 'string') setLatestVersion(result.version);
      } catch {
        // A failed check should not interrupt editorial work.
      } finally {
        checking = false;
      }
    }

    void checkVersion();
    const timer = window.setInterval(checkVersion, 120_000);
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', checkVersion);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', checkVersion);
    };
  }, [appVersion]);

  if (latestVersion === dismissedVersion || !shouldNotifyAboutVersion(appVersion, latestVersion)) return null;

  return (
    <aside className="app-update-notice" aria-label="SoMe-oppdatering">
      <div className="app-update-icon"><RefreshCw size={18} aria-hidden="true" /></div>
      <div className="app-update-content">
        <div role="status">
          <h2>En ny versjon av SoMe er tilgjengelig</h2>
          <p>Lagre eventuelle endringer før du oppdaterer siden.</p>
        </div>
        <div className="app-update-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>Oppdater siden nå</button>
          <button type="button" className="secondary" onClick={() => setDismissedVersion(latestVersion)}>Senere</button>
        </div>
      </div>
    </aside>
  );
}
