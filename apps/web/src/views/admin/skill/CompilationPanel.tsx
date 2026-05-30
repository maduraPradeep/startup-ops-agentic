import { Check, X, Circle, Loader2, Zap, AlertTriangle, Hash } from 'lucide-react';
import { clsx } from 'clsx';
import type { CompilationResult } from '@ops/shared';
import { deriveStageStatuses, type StageStatus } from '../../../lib/skill-editor';

interface Props {
  /** The finished compile result, or null before the first compile. */
  result: CompilationResult | null;
  isCompiling: boolean;
}

// Center panel: the compilation pipeline as an ordered checklist plus the outcome summary.
// The compiler is synchronous (one HTTP response), so we derive each stage's status from the
// final result: success → all done; a CompilationError names the failing `stage`, so everything
// before it is done, it is error, the rest pending (deriveStageStatuses, unit-tested).
export function CompilationPanel({ result, isCompiling }: Props) {
  const outcome = !result ? 'idle' : result.success ? 'success' : 'error';
  const failingStage = result && !result.success ? result.stage : undefined;
  const stages = deriveStageStatuses(
    isCompiling ? 'idle' : outcome,
    failingStage,
  );

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Outcome banner */}
      {isCompiling ? (
        <Banner tone="info" icon={<Loader2 size={16} className="animate-spin" />}>
          Compiling skill…
        </Banner>
      ) : result?.success ? (
        <SuccessSummary result={result} />
      ) : result && !result.success ? (
        <ErrorSummary result={result} />
      ) : (
        <Banner tone="muted" icon={<Circle size={16} />}>
          Not compiled yet. Author your skill text, then press Compile.
        </Banner>
      )}

      {/* Warnings (success only) */}
      {!isCompiling && result?.success && result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 mb-1.5">
            <AlertTriangle size={14} /> {result.warnings.length} warning
            {result.warnings.length === 1 ? '' : 's'}
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="text-xs text-amber-700">
                <span className="font-medium">{w.message}</span>
                <code className="ml-1.5 font-mono text-[11px] text-amber-600">{w.code}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stage checklist */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-3 py-2 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">Stages</span>
        </div>
        <ul className="px-3 py-2">
          {stages.map(({ stage, label, status }) => (
            <StageRow
              key={stage}
              label={label}
              status={isCompiling ? 'pending' : status}
              compiling={isCompiling}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function StageRow({
  label,
  status,
  compiling,
}: {
  label: string;
  status: StageStatus;
  compiling: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      {compiling ? (
        <Loader2 size={15} className="text-indigo-500 animate-spin shrink-0" />
      ) : status === 'done' ? (
        <Check size={15} className="text-green-600 shrink-0" />
      ) : status === 'error' ? (
        <X size={15} className="text-red-600 shrink-0" />
      ) : (
        <Circle size={15} className="text-gray-300 shrink-0" />
      )}
      <span
        className={clsx(
          'text-sm',
          status === 'done' && !compiling
            ? 'text-gray-700'
            : status === 'error'
              ? 'text-red-700 font-medium'
              : 'text-gray-400',
        )}
      >
        {label}
      </span>
    </li>
  );
}

function SuccessSummary({ result }: { result: Extract<CompilationResult, { success: true }> }) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800">
          <Check size={16} /> Compiled successfully
        </p>
        {result.from_cache && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            <Zap size={12} /> From cache
          </span>
        )}
      </div>
      <p className="inline-flex items-center gap-1.5 text-xs text-green-700 mt-2">
        <Hash size={12} />
        <code className="font-mono">{result.compilation_hash}</code>
      </p>
    </div>
  );
}

function ErrorSummary({ result }: { result: Extract<CompilationResult, { success: false }> }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-800">
        <X size={16} /> Compilation failed
      </p>
      <p className="text-xs text-red-600 mt-1 capitalize">
        Stage: <span className="font-medium">{result.stage.replace(/_/g, ' ')}</span>
        {result.error_type && (
          <>
            {' · '}
            {result.error_type.replace(/_/g, ' ')}
          </>
        )}
      </p>
      <p className="text-sm text-red-700 mt-2">{result.message}</p>
      {result.token_at_fault && (
        <p className="text-xs text-red-700 mt-2">
          Token at fault:{' '}
          <code className="font-mono bg-red-100 px-1 rounded">{result.token_at_fault}</code>
        </p>
      )}
      {result.suggestion && (
        <div className="mt-2 rounded-lg bg-white/60 border border-red-200 px-2.5 py-2">
          <p className="text-xs text-red-700">
            <span className="font-medium">Suggestion: </span>
            {result.suggestion}
          </p>
        </div>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'info' | 'muted';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border px-3 py-3 flex items-center gap-2 text-sm',
        tone === 'info' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </div>
  );
}
