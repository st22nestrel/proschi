import { useCallback, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { FIT_VIEW_OPTIONS, useFitOnChange } from '../Diagram/useFitOnChange';
import { CANVAS_ACCENT, CANVAS_EDGE, CANVAS_FAIL } from '../../utils/canvasColors';
import '@reactflow/node-resizer/dist/style.css';
import type { FlowStep } from '../../dsl/types';
import ComponentNode from '../Canvas/ComponentNode';
import TextNode from '../Canvas/TextNode';
import GroupNode from '../Canvas/GroupNode';
import SystemNode from '../Canvas/SystemNode';
import { PlaybackClock, PlaybackClockContext, usePlaybackProgress } from './playbackClock';
import { PLAYBACK_EDGE_TYPES, framesOf, isErrorStep, playbackView, stepIndexOf, type PlaybackView, type PlayedUseCase } from './playbackView';

const nodeTypes = {
  componentNode: ComponentNode,
  textNode: TextNode,
  groupNode: GroupNode,
  systemNode: SystemNode,
};

/** `PRE-REQUEST › root.yml`: the sections a step (or its response) is written in, if any. */
function sectionPath(step: FlowStep, response: boolean): string | undefined {
  const sections = response ? (step.responseSections ?? step.sections) : step.sections;
  return sections?.length ? sections.map((s) => s.name).join(' › ') : undefined;
}

/** How a body format reads in the step card. */
const FORMAT_LABEL: Record<FlowStep['responseFormat'], string> = { JSON: 'JSON', XML: 'XML', FREE_TEXT: 'Text' };

interface PlaybackOptions {
  nodes: Node[];
  edges: Edge[];
  onBack: () => void;
  /** 0-based step to open on, for links to a specific step. */
  initialStep?: number;
  onStepChange?: (index: number) => void;
  /** Hide the title bar when the host already shows the use case and a way back. */
  showHeader?: boolean;
  /**
   * Plays while true: from the moment a use case is given (e.g. after a Play
   * button outside it was pressed), and again whenever it turns true; pauses
   * when it turns false.
   */
  autoPlay?: boolean;
  /** Called once playback reaches the end of the last step (not when looping). */
  onFinished?: () => void;
  /** Start over from the first step after the last one, instead of stopping. */
  loop?: boolean;
  /**
   * Just the canvas: no step panel or controls, for an embedded preview whose
   * host shows its own captions.
   */
  bare?: boolean;
}

interface UseCasePlaybackProps extends PlaybackOptions {
  /** The use case to play; none draws the diagram as it is. A new `id` (or name) starts it over. */
  useCase?: PlayedUseCase;
  /** The host's canvas, given the diagram as drawn at the current step. It stays mounted when playback starts or stops. */
  children: (view: PlaybackView) => ReactNode;
}

/** How long each step is shown while playing. */
const STEP_MS = 2000;

/**
 * Step-by-step playback of a use case over a canvas the host draws. The canvas
 * is the same one that shows the diagram when nothing plays: playback only
 * restyles it (highlighted nodes, the travelling packet) and adds the step
 * panel and controls below it, so starting, replaying or stopping never
 * remounts, re-lays-out or re-fits the diagram.
 */
export function UseCasePlayback({
  useCase,
  nodes,
  edges,
  onBack,
  initialStep,
  onStepChange,
  showHeader = true,
  autoPlay = false,
  onFinished,
  loop = false,
  bare = false,
  children,
}: UseCasePlaybackProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clock] = useState(() => new PlaybackClock());
  const steps = useMemo(() => useCase?.steps ?? [], [useCase]);
  const frames = useMemo(() => framesOf(steps), [steps]);

  const onFinishedRef = useRef(onFinished);
  const autoPlayRef = useRef(autoPlay);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onFinishedRef.current = onFinished;
    autoPlayRef.current = autoPlay;
    onBackRef.current = onBack;
  });

  // Escape leaves playback, unless it is meant for a field or an open menu.
  const playingSomething = !!useCase;
  useEffect(() => {
    if (bare || !playingSomething) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]')) return;
      onBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bare, playingSomething]);

  // Restart when a different use case is played (not when the same one is edited);
  // only the first one honours initialStep.
  const useCaseKey = useCase ? (useCase.id ?? useCase.name) : undefined;
  const firstUseCaseKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (useCaseKey !== undefined && firstUseCaseKeyRef.current === undefined) firstUseCaseKeyRef.current = useCaseKey;
    const start = useCaseKey !== undefined && useCaseKey === firstUseCaseKeyRef.current ? (initialStep ?? 0) : 0;
    const startFrame = frames.findIndex((frame) => frame.steps.includes(steps[Math.min(Math.max(start, 0), steps.length - 1)]));
    setCurrentStepIndex(Math.max(startFrame, 0));
    const play = useCaseKey !== undefined && autoPlayRef.current && frames.length > 0;
    setIsPlaying(play);
    if (play) clock.start();
    else clock.reset();
    // initialStep only matters for the first use case; edits keep the current step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCaseKey]);

  // Editing can remove steps; stay within range.
  useEffect(() => {
    setCurrentStepIndex((index) => Math.min(index, Math.max(frames.length - 1, 0)));
  }, [frames.length]);

  useEffect(() => {
    onStepChange?.(stepIndexOf(steps, frames[currentStepIndex]));
  }, [currentStepIndex, onStepChange, steps, frames]);

  useEffect(() => () => clock.stop(), [clock]);

  // While playing, move on one step every STEP_MS; at the end stop (or loop).
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => {
      if (currentStepIndex < frames.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
        clock.start();
      } else if (loop) {
        setCurrentStepIndex(0);
        clock.start();
      } else {
        setIsPlaying(false);
        onFinishedRef.current?.();
      }
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, frames.length, loop, clock]);

  const handlePlay = () => {
    setIsPlaying(true);
    clock.start();
  };

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    clock.stop();
  }, [clock]);

  // `autoPlay` follows its host: playing while true, paused when it turns false.
  const autoPlayedRef = useRef(autoPlay);
  useEffect(() => {
    if (autoPlay === autoPlayedRef.current) return;
    autoPlayedRef.current = autoPlay;
    if (!useCase) return;
    if (autoPlay) {
      // Resume where it was paused, mid-step if the packet was on its way.
      setIsPlaying(true);
      clock.resume();
    } else {
      handlePause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  // Manual steps animate too, so a failed call still shows where it was cut off.
  const handleStepForward = () => {
    handlePause();
    setCurrentStepIndex((prev) => Math.min(prev + 1, frames.length - 1));
    clock.start();
  };

  const handleStepBack = () => {
    handlePause();
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    clock.start();
  };

  const handleReset = () => {
    handlePause();
    setCurrentStepIndex(0);
    clock.reset();
  };

  // Rebuilt once per step, not on every tick of the packet.
  const view = useMemo(() => playbackView(nodes, edges, useCase, currentStepIndex), [nodes, edges, useCase, currentStepIndex]);
  const frame = useCase ? frames[currentStepIndex] : undefined;
  // What the panel describes: calls going out, then answers coming back.
  // A request answered later shows its answer (body, status, error) in that frame, not this one.
  const entries = [
    ...(frame?.steps ?? []).map((step) => ({ step, response: false, answered: !step.deferredResponse })),
    ...(frame?.responses ?? []).map((step) => ({ step, response: true, answered: true })),
  ];

  return (
    <div className={`pc-playback h-full flex flex-col ${bare || !useCase ? '' : 'bg-paper'}`} data-playing={useCase ? '' : undefined}>
      {/* Header */}
      {useCase && showHeader && !bare && (
      <div className="bg-surface border-b border-ink/15 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 text-ink/75 hover:bg-ink/10 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-ink">{useCase.name}</h2>
              <p className="text-sm text-muted">Playback Mode - Read Only</p>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="pc-playback__canvas flex-1 min-h-0 relative">
        <PlaybackClockContext.Provider value={clock}>{children(view)}</PlaybackClockContext.Provider>
      </div>

      {useCase && !bare && steps.length === 0 && (
        <div className="pc-playback__panel bg-surface border-t border-ink/15 p-4 flex flex-wrap items-center justify-center gap-4">
          <div className="text-muted">This use case has no steps to play</div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 bg-pop-yellow text-on-accent font-semibold border-bw-1 border-ink shadow-brutal-sm rounded-lg hover:bg-pop-yellow/85 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Use Cases
          </button>
        </div>
      )}

      {useCase && !bare && steps.length > 0 && <>
      {/* Step Info Panel */}
      <div className="pc-playback__steps bg-surface border-t border-ink/15 p-3 sm:p-4 max-h-[35vh] sm:max-h-64 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {useCase.condition && (
            <p className="mb-2 text-sm text-ink/75">
              <span className="font-medium text-ink/85">When:</span> {useCase.condition}
            </p>
          )}
          {entries.length > 1 && (
            <div className="mb-2 text-sm font-medium text-pop-blue">
              ⚡ Parallel Execution ({entries.length} steps running simultaneously)
            </div>
          )}
          {entries.map(({ step, response, answered }, idx) => (
            <div key={step.id || idx} className="mb-4 last:mb-0">
              <div className="flex items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                        answered && isErrorStep(step) ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-pop-blue/15 text-pop-blue'
                      }`}
                    >
                      {response ? '↩' : steps.indexOf(step) + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {sectionPath(step, response) && <p className="text-xs font-semibold text-muted break-words">{sectionPath(step, response)}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink break-words">{response ? `Response to ${step.stepName}` : step.stepName}</h3>
                        {step.failed && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-sm">Failed</span>
                        )}
                        {answered && !step.failed && (step.statusCode ?? 0) >= 400 && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-sm">{step.statusCode}</span>
                        )}
                        {step.executionType === 'SYNC_REQUEST_RESPONSE' && !step.failed && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-sm">Sync</span>
                        )}
                        {step.executionType === 'ASYNC_FIRE_AND_FORGET' && (
                          <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-sm">Fire & Forget</span>
                        )}
                        {step.executionType === 'ASYNC_REQUEST_RESPONSE' && (
                          <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-sm">Async</span>
                        )}
                      </div>
                      <p className="text-sm text-muted">
                        {nodes.find((n) => n.id === (response ? step.toServiceId : step.fromServiceId))?.data.name} →{' '}
                        {nodes.find((n) => n.id === (response ? step.fromServiceId : step.toServiceId))?.data.name}
                      </p>
                    </div>
                    {`${step.httpMethod} ${step.endpoint}`.trim() !== step.stepName && (
                      <div className="text-sm text-muted break-all">
                        {step.httpMethod} {step.endpoint}
                      </div>
                    )}
                  </div>

                  {step.description && (
                    <p className="text-sm text-ink/75 mb-3">{step.description}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {!response && step.requestBody && (
                      <div>
                        <div className="text-xs font-medium text-muted mb-1">
                          Request ({FORMAT_LABEL[step.requestFormat]})
                        </div>
                        <pre className="text-xs bg-paper p-2 rounded-sm border border-ink/15 overflow-auto max-h-32">
                          {step.requestBody}
                        </pre>
                      </div>
                    )}
                    {answered && step.responseBody && step.executionType !== 'ASYNC_FIRE_AND_FORGET' && (
                      <div>
                        <div className={`text-xs font-medium mb-1 ${isErrorStep(step) ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
                          Response ({FORMAT_LABEL[step.responseFormat]}){step.statusCode !== undefined && ` - ${step.statusCode}`}
                        </div>
                        <pre
                          className={`text-xs p-2 rounded-sm border overflow-auto max-h-32 ${
                            isErrorStep(step) ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800' : 'bg-paper border-ink/15'
                          }`}
                        >
                          {step.responseBody}
                        </pre>
                      </div>
                    )}
                    {answered && !step.responseBody && !step.failed && (step.statusCode ?? 0) >= 400 && (
                      <div className="text-sm text-red-700 dark:text-red-300">Answered with {step.statusCode}</div>
                    )}
                    {step.failed && (
                      <div className="text-sm text-red-700 dark:text-red-300">No response: the call failed (timeout, connection refused or similar).</div>
                    )}
                  </div>
                </div>
              </div>
              {idx < entries.length - 1 && <hr className="mt-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Playback Controls */}
      <div className="pc-playback__controls bg-surface border-t border-ink/15 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="p-2 text-ink/75 hover:bg-ink/10 rounded-lg transition-colors"
                title="Reset to start"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={handleStepBack}
                disabled={currentStepIndex === 0}
                className="p-2 text-ink/75 hover:bg-ink/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous step"
              >
                <ChevronLeft size={20} />
              </button>
              {!isPlaying ? (
                <button
                  onClick={handlePlay}
                  className="p-3 bg-pop-yellow text-on-accent font-semibold border-bw-1 border-ink shadow-brutal-sm hover:bg-pop-yellow/85 rounded-lg transition-colors"
                  title="Play"
                >
                  <Play size={24} />
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="p-3 bg-pop-yellow text-on-accent font-semibold border-bw-1 border-ink shadow-brutal-sm hover:bg-pop-yellow/85 rounded-lg transition-colors"
                  title="Pause"
                >
                  <Pause size={24} />
                </button>
              )}
              <button
                onClick={handleStepForward}
                disabled={currentStepIndex === frames.length - 1}
                className="p-2 text-ink/75 hover:bg-ink/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next step"
              >
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => setCurrentStepIndex(frames.length - 1)}
                className="p-2 text-ink/75 hover:bg-ink/10 rounded-lg transition-colors"
                title="Go to end"
              >
                <SkipForward size={20} />
              </button>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink/85">
                  Step {currentStepIndex + 1} of {frames.length}
                </span>
                <PlaybackClockContext.Provider value={clock}>
                  <ProgressBar step={currentStepIndex} total={frames.length} />
                </PlaybackClockContext.Provider>
              </div>
            </div>
            {!showHeader && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-ink/75 hover:bg-ink/10 rounded-lg transition-colors"
                title="Exit playback (Esc)"
              >
                <X size={16} aria-hidden />
                Exit playback
              </button>
            )}
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

/** How far through the use case playback is; follows the packet without re-rendering the panel. */
function ProgressBar({ step, total }: { step: number; total: number }) {
  // Whole percents are smooth enough and re-render at most 100 times a step.
  const progress = usePlaybackProgress((p) => Math.round(p));
  return (
    <div className="flex-1 h-2 bg-ink/10 rounded-full overflow-hidden">
      <div className="h-full bg-pop-yellow" style={{ width: `${((step + progress / 100) / total) * 100}%` }} />
    </div>
  );
}

interface UseCasePlayerProps extends PlaybackOptions {
  useCase: PlayedUseCase;
}

/** Playback on a canvas of its own, for pages that show it in place of their diagram. */
export function UseCasePlayer(props: UseCasePlayerProps) {
  return (
    <ReactFlowProvider>
      <UseCasePlayback {...props}>{(view) => <PlayerCanvas view={view} bare={!!props.bare} />}</UseCasePlayback>
    </ReactFlowProvider>
  );
}

function PlayerCanvas({ view, bare }: { view: PlaybackView; bare: boolean }) {
  useFitOnChange(view.nodes.map((n) => n.id).join('|'));
  return (
    <ReactFlow
      nodes={view.nodes}
      edges={view.edges}
      nodeTypes={nodeTypes}
      edgeTypes={PLAYBACK_EDGE_TYPES}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      // Small panes (the landing demo on a phone) need to zoom out past React Flow's default 0.5 to fit.
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      className={bare ? '' : 'bg-paper'}
      panOnDrag={!bare}
      zoomOnScroll={!bare}
      zoomOnPinch={!bare}
      zoomOnDoubleClick={!bare}
      preventScrolling={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      {!bare && <Controls showInteractive={false} />}
      {!bare && <PlaybackMiniMap view={view} />}
    </ReactFlow>
  );
}

/** The minimap of a canvas that plays use cases, with the current step's nodes picked out. */
export function PlaybackMiniMap({ view }: { view: PlaybackView }) {
  return (
    <MiniMap
      className="!hidden md:!block"
      nodeColor={(node) => (view.errorNodes.has(node.id) ? CANVAS_FAIL : view.highlighted.has(node.id) ? CANVAS_ACCENT : CANVAS_EDGE)}
      maskColor="rgb(var(--c-paper) / 0.6)"
    />
  );
}
