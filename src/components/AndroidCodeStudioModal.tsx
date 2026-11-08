import React, { useState } from 'react';
import { Check, Copy, Download, FileCode, ShieldCheck, Terminal } from 'lucide-react';
import { ANDROID_KOTLIN_ARTIFACTS } from '../data/androidKotlinProject';
import { runDomainUnitTests } from '../utils/bloodBankLogic';
import { firebaseConfig } from '../firebase';
import { Language } from '../translations';

interface AndroidCodeStudioViewProps {
  lang: Language;
}

export const AndroidCodeStudioView: React.FC<AndroidCodeStudioViewProps> = ({ lang }) => {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_KOTLIN_ARTIFACTS[0].id);
  const [copied, setCopied] = useState(false);
  const [showSideloadGuide, setShowSideloadGuide] = useState(false);

  const selectedArtifact =
    ANDROID_KOTLIN_ARTIFACTS.find((a) => a.id === selectedId) || ANDROID_KOTLIN_ARTIFACTS[0];
  const unitTests = runDomainUnitTests();

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header Summary */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {lang === 'bn'
                ? 'Android (Kotlin + Jetpack Compose) ও Cloudflare Worker সোর্স কোড'
                : 'Android (Kotlin + Jetpack Compose) & Cloudflare Worker Source Code'}
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {lang === 'bn'
                ? 'SRS v1.0 ও PRD v1.0 অনুযায়ী সম্পূর্ণ MVVM আর্কিটেকচার, FCM ব্লাড-গ্রুপ টপিক পুশ এবং ডিরেক্ট APK ইনস্টল গাইড।'
                : 'Complete MVVM architecture per SRS v1.0 & PRD v1.0, wired to your provisioned Firebase Spark backend and Cloudflare Worker.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
              <span>Project ID: {firebaseConfig.projectId}</span>
              <span aria-hidden="true">·</span>
              <span>Firestore DB: {firebaseConfig.firestoreDatabaseId}</span>
              <span aria-hidden="true">·</span>
              <span>Min SDK: API 26 (Android 8.0)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowSideloadGuide(!showSideloadGuide)}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'bn' ? 'APK ইনস্টল ও আপডেট গাইড (FR-SET-04)' : 'APK Install & Update Guide (FR-SET-04)'}
            </button>
          </div>
        </div>

        {/* Sideload Install Guide (SRS FR-SET-04) */}
        {showSideloadGuide && (
          <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                01. {lang === 'bn' ? 'APK ডাউনলোড করুন' : 'Download Signed APK'}
              </div>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {lang === 'bn'
                  ? 'Remote Config বা অফিসিয়াল লিংক থেকে 0709-blood-bank-release.apk ডাউনলোড করুন (সাইজ < ২৫ MB)।'
                  : 'Download the signed 0709-blood-bank-release.apk (< 25 MB) from the official link or Firebase App Distribution.'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                02. {lang === 'bn' ? 'Install Unknown Apps অনুমতি দিন' : 'Allow Install Unknown Apps'}
              </div>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {lang === 'bn'
                  ? 'Settings → Apps → Special App Access → Install Unknown Apps থেকে আপনার ব্রাউজার বা ফাইল ম্যানেজারে অনুমতি দিন।'
                  : 'Enable "Allow from this source" in Android Settings when opening the APK outside the Play Store.'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                03. {lang === 'bn' ? 'Play Protect ও ওভার-দ্য-টপ আপডেট' : 'Play Protect & In-Place Updates'}
              </div>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {lang === 'bn'
                  ? 'Play Protect পপআপ আসলে "Install Anyway" চাপুন। পরবর্তী ভার্সন একই রিলিজ কি-স্টোর দিয়ে সাইন করা থাকায় পুরাতন অ্যাপ আনইনস্টল না করেই আপডেট হবে (UC-05)।'
                  : 'Tap "Install Anyway" if Play Protect prompts. Future updates use the same release keystore and install cleanly over the existing app (UC-05).'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Code Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left File Selector */}
        <div className="lg:col-span-4 space-y-2">
          {ANDROID_KOTLIN_ARTIFACTS.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  active
                    ? 'border-[#C62828] bg-[#C62828]/5 dark:bg-[#EF5350]/10'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[#C62828] dark:text-[#EF5350] shrink-0" />
                    {item.filename}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                    {item.language}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {lang === 'bn' ? item.descriptionBn : item.descriptionEn}
                </p>
                <div className="mt-2 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                  {item.requirementIds.join(' · ')}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Code Viewer */}
        <div className="lg:col-span-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {selectedArtifact.path}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {selectedArtifact.category} · {selectedArtifact.requirementIds.join(' · ')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(selectedArtifact.code)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-[#2E7D32]" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadFile(selectedArtifact.filename, selectedArtifact.code)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#C62828] hover:bg-[#8E0000] text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>

          <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto bg-neutral-950 text-neutral-100 max-h-[540px]">
            <code>{selectedArtifact.code}</code>
          </pre>
        </div>
      </div>

      {/* Automated SRS Unit Test Verification Table (NFR-MNT-02 & Section 10) */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#2E7D32]" />
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {lang === 'bn'
                ? 'অটোমেটেড ইউনিট টেস্ট ও অ্যাকসেপ্টেন্স ক্রাইটেরিয়া যাচাইকরণ (SRS NFR-MNT-02 & Section 10)'
                : 'Automated Unit Tests & Acceptance Criteria Verification (SRS NFR-MNT-02 & Section 10)'}
            </h3>
          </div>
          <span className="text-xs font-mono text-[#2E7D32] font-semibold">
            {unitTests.filter((t) => t.passed).length}/{unitTests.length} PASSED
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400">
                <th className="py-2.5 pr-4 font-medium">ID</th>
                <th className="py-2.5 pr-4 font-medium">Requirement</th>
                <th className="py-2.5 pr-4 font-medium">Scenario</th>
                <th className="py-2.5 pr-4 font-medium">Actual Output</th>
                <th className="py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70 font-mono tabular-nums">
              {unitTests.map((test) => (
                <tr key={test.id}>
                  <td className="py-3 pr-4 font-semibold text-neutral-900 dark:text-neutral-100">
                    {test.id}
                  </td>
                  <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">
                    {test.requirement}
                  </td>
                  <td className="py-3 pr-4 font-sans text-neutral-800 dark:text-neutral-200">
                    {test.name}
                  </td>
                  <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">
                    {test.actual}
                  </td>
                  <td className="py-3 text-right font-semibold text-[#2E7D32]">
                    {test.passed ? 'PASS' : 'FAIL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
