import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Play, Loader2, ServerCrash } from 'lucide-react';
import type { CompilationResult } from '@ops/shared';
import { useCompileSkill, useResolveTokens, type TokenResolveResult } from '../queries/useSkills';
import { SkillTextEditor } from '../views/admin/skill/SkillTextEditor';
import { CompilationPanel } from '../views/admin/skill/CompilationPanel';
import { FlowGraph } from '../views/admin/skill/FlowGraph';

// Phase 1b — Skill Editor controller. Full-page overlay (z-20) reachable from the sidebar
// (see admin-surface.store + AppController), mirroring SchemaBuilderController. Owns: the skill
// text, debounced token resolution, the compile request, and detection of the 503
// "compiler unavailable" state. The query layer (useSkills) does not swallow errors — apiClient
// throws with `.status`/`.data`, which we translate here.
//
// Note: a *failed compile* is HTTP 200 (a CompilationError), so it arrives as a successful
// mutation result; only transport failures (400/503/network) throw. We branch accordingly.

interface Props {
  onClose: () => void;
}

const RESOLVE_DEBOUNCE_MS = 300;

/** True if a thrown apiClient error is a 503 (compiler unavailable — ANTHROPIC_API_KEY unset). */
function isUnavailable(err: unknown): boolean {
  return (err as { status?: number })?.status === 503;
}

export function SkillEditorController({ onClose }: Props) {
  const [skillText, setSkillText] = useState('');
  const [resolveResult, setResolveResult] = useState<TokenResolveResult | null>(null);
  const [compileResult, setCompileResult] = useState<CompilationResult | null>(null);
  // Either endpoint 503ing means the compiler is unavailable in this environment.
  const [unavailable, setUnavailable] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  const resolveTokens = useResolveTokens();
  const compileSkill = useCompileSkill();

  // Keep the latest resolve mutation in a ref so the debounce effect doesn't re-fire on every
  // render (the mutation object identity changes each render).
  const resolveRef = useRef(resolveTokens);
  resolveRef.current = resolveTokens;

  // Debounced token resolution as the operator types (UI-DESIGN §7.5). We fire /tokens/resolve
  // and surface parsed/unresolved tokens in the editor's status panel. 503 → unavailable.
  useEffect(() => {
    const text = skillText.trim();
    if (text.length === 0) {
      setResolveResult(null);
      return;
    }
    if (unavailable) return;

    const handle = window.setTimeout(() => {
      resolveRef.current.mutate(
        { skill_text: skillText },
        {
          onSuccess: (data) => setResolveResult(data),
          onError: (err) => {
            if (isUnavailable(err)) setUnavailable(true);
            // Other resolve errors (e.g. transient network) are non-fatal: keep last good state.
          },
        },
      );
    }, RESOLVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [skillText, unavailable]);

  function handleCompile() {
    if (skillText.trim().length === 0 || unavailable) return;
    setCompileError(null);
    compileSkill.mutate(
      { skill_text: skillText },
      {
        onSuccess: (data) => setCompileResult(data),
        onError: (err) => {
          if (isUnavailable(err)) {
            setUnavailable(true);
            return;
          }
          // 400 (empty/invalid) or network — surface inline, don't crash.
          setCompileError(
            (err as Error)?.message || 'Something went wrong compiling this skill. Please try again.',
          );
        },
      },
    );
  }

  const graph = compileResult?.success ? compileResult.react_flow_graph : null;
  const canCompile = skillText.trim().length > 0 && !unavailable && !compileSkill.isPending;

  return (
    <div className="fixed inset-0 z-20 bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">Skill Editor</h1>
            <p className="text-xs text-gray-500 truncate">
              Author a skill in plain language, compile it, and validate the generated workflow.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompile}
            disabled={!canCompile}
            className="inline-flex items-center justify-center gap-2 min-w-[120px] bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {compileSkill.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Play size={16} /> Compile
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
            aria-label="Close Skill Editor"
          >
            <X size={18} /> Close
          </button>
        </div>
      </header>

      {unavailable ? (
        <UnavailableState />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {compileError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-sm text-red-700">{compileError}</p>
              </div>
            )}

            {/* Three-panel layout (UI-DESIGN §4.6): authoring · compilation · flow graph.
                Stacks to one column below xl per the responsive spec. */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <section aria-label="Skill authoring">
                <SkillTextEditor
                  value={skillText}
                  onChange={setSkillText}
                  resolve={resolveResult}
                  isResolving={resolveTokens.isPending}
                  resolveUnavailable={unavailable}
                  disabled={compileSkill.isPending}
                />
              </section>

              <section aria-label="Compilation status">
                <CompilationPanel result={compileResult} isCompiling={compileSkill.isPending} />
              </section>

              <section aria-label="Visual validation" className="min-h-0">
                <FlowGraph graph={graph} />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Clear, non-crashing state when the compiler backend is unavailable (ANTHROPIC_API_KEY unset →
// both endpoints 503). Shown instead of a generic error so dev environments degrade gracefully.
function UnavailableState() {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <ServerCrash size={24} />
        </div>
        <p className="text-base font-medium text-gray-700">Skill compiler is unavailable</p>
        <p className="text-sm text-gray-500 mt-1.5">
          This environment doesn’t have the skill compiler configured, so skills can’t be resolved
          or compiled right now. You can still draft skill text, but compilation requires the
          compiler to be enabled on the server.
        </p>
      </div>
    </div>
  );
}
