import React from "react";

interface GuideCardProps {
  title: string;
  children: React.ReactNode;
}

const GuideCard: React.FC<GuideCardProps> = ({ title, children }) => (
  <div className="section-block">
    <div className="section-heading">{title}</div>
    {children}
  </div>
);

export const UserGuide: React.FC = () => (
  <div className="guide-grid">

    <GuideCard title="Pattern Backup">
      <ol>
        <li>Power off the P-6</li>
        <li>Hold <strong>[PLAY]</strong> and power on — device mounts with a BACKUP folder</li>
        <li>Connect via USB, select patterns in the app, and click Create Backup</li>
        <li>Eject the device when done</li>
      </ol>
    </GuideCard>

    <GuideCard title="Pattern Restore">
      <ol>
        <li>Power off the P-6</li>
        <li>Hold <strong>[REC]</strong> and power on — device mounts with a RESTORE folder</li>
        <li>Connect via USB, select a backup in the app, and click Restore</li>
        <li>Press <strong>[KYBD]</strong> on the P-6 to start the restore</li>
        <li>Wait for <em>donE</em> on the display, then power off</li>
      </ol>
      <div className="info-box" style={{ marginTop: 8 }}>
        <p>Pattern restore may take up to 5 minutes. Progress is visible on the Step Buttons.</p>
      </div>
    </GuideCard>

    <GuideCard title="Sample Backup">
      <ol>
        <li>Power off the P-6</li>
        <li>Hold <strong>[BANK] + [SAMPLING]</strong> and power on — device mounts with an EXPORT folder</li>
        <li>Connect via USB — the app detects which bank is loaded</li>
        <li>Click Create Backup to export the current bank</li>
        <li>Power off and repeat for each bank (A–H) you want to back up</li>
      </ol>
    </GuideCard>

    <GuideCard title="Sample Restore">
      <p style={{ marginBottom: 8 }}>
        Sample restore requires two sessions — Banks A–D first, then Banks E–H.
      </p>
      <p><strong>Session 1 — Banks A–D</strong></p>
      <ol>
        <li>Power off the P-6</li>
        <li>Hold <strong>[SAMPLING]</strong> and power on — device mounts with an IMPORT folder</li>
        <li>Connect via USB, select a backup and banks A–D in the app, click Restore</li>
        <li>Press <strong>[KYBD]</strong> on the P-6 to start the import</li>
        <li>Wait for <em>donE</em> on the display, then power off</li>
      </ol>
      <p style={{ marginTop: 8 }}><strong>Session 2 — Banks E–H</strong></p>
      <ol>
        <li>Hold <strong>[SAMPLING]</strong> and power on again</li>
        <li>Connect via USB, select banks E–H in the app, click Restore</li>
        <li>Press <strong>[KYBD]</strong> on the P-6 to start the import</li>
        <li>Wait for <em>donE</em> on the display, then power off</li>
      </ol>
      <div className="info-box" style={{ marginTop: 8 }}>
        <p>Never power off the P-6 while an import is in progress — this may corrupt the device.</p>
      </div>
    </GuideCard>

    <GuideCard title="Quick Reference">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Operation</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Button combination</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Device mounts as</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Pattern Backup",  "[PLAY] + power",             "BACKUP folder"],
            ["Pattern Restore", "[REC] + power",              "RESTORE folder"],
            ["Sample Backup",   "[BANK] + [SAMPLING] + power","EXPORT folder"],
            ["Sample Restore",  "[SAMPLING] + power",         "IMPORT folder"],
          ].map(([op, combo, mount]) => (
            <tr key={op}>
              <td style={{ padding: "4px 0" }}>{op}</td>
              <td style={{ padding: "4px 8px" }}><strong>{combo}</strong></td>
              <td style={{ padding: "4px 0", opacity: 0.7 }}>{mount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GuideCard>

  </div>
);
