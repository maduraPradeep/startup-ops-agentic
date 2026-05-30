import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ParsedToken } from '@ops/shared';
import { tokenKindStyle } from '../../../lib/skill-editor';
import type { TokenResolveResult } from '../../../queries/useSkills';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Live token-resolve result (debounced), or null before the first resolve. */
  resolve: TokenResolveResult | null;
  isResolving: boolean;
  /** True once we've detected the resolve endpoint is unavailable (503). */
  resolveUnavailable: boolean;
  disabled?: boolean;
}

const PLACEHOLDER = `When an employee submits a leave request, collect the dates from
@entity:leave_requests, then notify their @role:manager for approval...

Type @ to reference an entity, field, role, agent or tool.`;

// Left panel: the skill source textarea plus a live "Tokens" status panel. We don't build a full
// code editor or an inline @-dropdown overlay (out of scope per the brief) — instead the panel
// surfaces every parsed @token and flags unresolved ones, driven by debounced /tokens/resolve
// calls in the controller. This is the pragmatic "token autocomplete / status" the brief asks for.
export function SkillTextEditor({
  value,
  onChange,
  resolve,
  isResolving,
  resolveUnavailable,
  disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex flex-col">
        <label htmlFor="skill-text" className="text-sm font-medium text-gray-700 mb-1">
          Skill text *
        </label>
        <textarea
          id="skill-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          className={clsx(
            'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono leading-relaxed text-gray-900',
            'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            'disabled:bg-gray-50 disabled:text-gray-500 resize-none h-72',
          )}
        />
        <p className="text-xs text-gray-500 mt-1">
          Reference platform objects with <code className="font-mono bg-gray-100 px-1 rounded">@</code>{' '}
          tokens, e.g. <code className="font-mono bg-gray-100 px-1 rounded">@entity:leave_requests</code>{' '}
          or <code className="font-mono bg-gray-100 px-1 rounded">@role:manager</code>.
        </p>
      </div>

      <TokenStatus
        resolve={resolve}
        isResolving={isResolving}
        resolveUnavailable={resolveUnavailable}
        hasText={value.trim().length > 0}
      />
    </div>
  );
}

function TokenStatus({
  resolve,
  isResolving,
  resolveUnavailable,
  hasText,
}: {
  resolve: TokenResolveResult | null;
  isResolving: boolean;
  resolveUnavailable: boolean;
  hasText: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-700">Tokens</span>
        {isResolving && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" /> Resolving…
          </span>
        )}
      </div>

      <div className="px-3 py-3">
        {resolveUnavailable ? (
          <p className="text-xs text-gray-500">
            Token resolution is unavailable in this environment.
          </p>
        ) : !hasText ? (
          <p className="text-xs text-gray-400">
            Start typing to see the platform tokens referenced by this skill.
          </p>
        ) : resolve && !resolve.ok ? (
          <UnresolvedToken errorType={resolve.errorType} message={resolve.message} token={resolve.token} />
        ) : resolve && resolve.ok ? (
          <ResolvedTokenList tokens={resolve.tokens} />
        ) : (
          <p className="text-xs text-gray-400">Resolving tokens…</p>
        )}
      </div>
    </div>
  );
}

function ResolvedTokenList({ tokens }: { tokens: ParsedToken[] }) {
  if (tokens.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        No tokens referenced yet. Add an <code className="font-mono bg-gray-100 px-1 rounded">@</code> token.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="inline-flex items-center gap-1.5 text-xs text-green-700">
        <CheckCircle2 size={13} /> {tokens.length} token{tokens.length === 1 ? '' : 's'} resolved
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {tokens.map((t, i) => {
          const style = tokenKindStyle(t.kind);
          return (
            <li
              key={`${t.raw}-${i}`}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                style.bg,
                style.text,
              )}
              title={`${style.label}: ${t.raw}`}
            >
              <span className="opacity-70">{style.label}</span>
              <code className="font-mono">{t.raw}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UnresolvedToken({
  errorType,
  message,
  token,
}: {
  errorType: string;
  message: string;
  token?: string;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <AlertTriangle size={14} /> Unresolved token
      </p>
      {token && (
        <p className="text-xs text-amber-800 mt-1">
          <code className="font-mono bg-amber-100 px-1 rounded">{token}</code>
        </p>
      )}
      <p className="text-xs text-amber-700 mt-1">{message}</p>
      <p className="text-[11px] text-amber-600 mt-1 capitalize">{errorType.replace(/_/g, ' ')}</p>
    </div>
  );
}
