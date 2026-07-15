import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
  type TouchEvent,
} from "react";
import { GALLERY_LIMITS } from "../../../../shared/constants/gallery.ts";
import type { GalleryItem } from "../../../../shared/types/gallery.ts";
import { UI_SYMBOLS } from "../../../constants/ui.ts";
import { UI_TEXT } from "../../../constants/uiText.ko.ts";

type Props = {
  items: GalleryItem[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
};

type StageSize = {
  width: number;
  height: number;
};

type MediaSize = {
  width: number;
  height: number;
};

const ROTATION_STEP_DEGREES = 90;
const HALF_ROTATION_DEGREES = 180;
const FULL_ROTATION_DEGREES = 360;
const ZOOMED_VIEWPORT_SCALE = 1.01;

export function GalleryViewer({ items, index, onChange, onClose }: Props) {
  const item = items[index];
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntil = useRef(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [stageSize, setStageSize] = useState<StageSize | null>(null);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;
  const isSideways = rotationDegrees % HALF_ROTATION_DEGREES !== 0;
  const mediaClassName = `gallery-viewer-media${
    isSideways ? " gallery-viewer-media-sideways" : ""
  }`;
  const mediaStyle = {
    transform: `rotate(${rotationDegrees}deg)`,
    ...(controlsVisible && isSideways && stageSize
      ? { width: stageSize.height, height: stageSize.width }
      : {}),
  };
  const mediaFrameStyle = getMediaFrameStyle(
    controlsVisible,
    isSideways,
    mediaSize,
    stageSize,
  );
  const backdropStyle = {
    transform: `translate(-50%, -50%) rotate(${rotationDegrees}deg) scale(var(--gallery-viewer-backdrop-scale))`,
  };

  useEffect(() => {
    setVideoFailed(false);
    setRotationDegrees(0);
    setMediaSize(null);
  }, [item.id]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [controlsVisible, item.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observedStage = stage;
    function updateStageSize() {
      const nextSize = {
        width: observedStage.clientWidth,
        height: observedStage.clientHeight,
      };
      if (nextSize.width === 0 || nextSize.height === 0) return;
      setStageSize((current) =>
        current?.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
    }
    updateStageSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateStageSize);
    resizeObserver?.observe(observedStage);
    window.addEventListener("resize", updateStageSize);
    window.visualViewport?.addEventListener("resize", updateStageSize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateStageSize);
      window.visualViewport?.removeEventListener("resize", updateStageSize);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrevious) onChange(index - 1);
      if (event.key === "ArrowRight" && hasNext) onChange(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasNext, hasPrevious, index, onChange, onClose]);

  function startSwipe(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    touchStart.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }

  function finishSwipe(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (start === null || event.changedTouches.length !== 1) return;
    const distanceX = event.changedTouches[0].clientX - start.x;
    const distanceY = event.changedTouches[0].clientY - start.y;
    const absoluteX = Math.abs(distanceX);
    const absoluteY = Math.abs(distanceY);
    if (
      Math.max(absoluteX, absoluteY) >
      GALLERY_LIMITS.tapMovementTolerancePixels
    ) {
      ignoreClickUntil.current = Date.now() + GALLERY_LIMITS.swipeClickDelayMs;
    }
    if (
      (window.visualViewport?.scale ?? 1) >= ZOOMED_VIEWPORT_SCALE
    ) {
      return;
    }
    if (!controlsVisible) return;
    const isIntentionalSwipe =
      absoluteX >= GALLERY_LIMITS.swipeThresholdPixels &&
      absoluteX >= absoluteY * GALLERY_LIMITS.swipeAxisDominanceRatio;
    if (!isIntentionalSwipe) return;
    if (distanceX > 0 && hasPrevious) {
      onChange(index - 1);
    } else if (distanceX < 0 && hasNext) {
      onChange(index + 1);
    }
  }

  function toggleControls() {
    if (Date.now() < ignoreClickUntil.current) return;
    ignoreClickUntil.current = 0;
    if (controlsVisible) {
      setControlsVisible(false);
      return;
    }
    setControlsVisible(true);
  }

  function rotateMedia() {
    setRotationDegrees(
      (degrees) =>
        (degrees + ROTATION_STEP_DEGREES) % FULL_ROTATION_DEGREES,
    );
  }

  function registerImageSize(event: SyntheticEvent<HTMLImageElement>) {
    registerMediaSize(
      event.currentTarget.naturalWidth,
      event.currentTarget.naturalHeight,
    );
  }

  function registerVideoSize(event: SyntheticEvent<HTMLVideoElement>) {
    registerMediaSize(
      event.currentTarget.videoWidth,
      event.currentTarget.videoHeight,
    );
  }

  function registerMediaSize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    setMediaSize({ width, height });
  }

  return (
    <div
      className={`gallery-viewer${
        controlsVisible ? "" : " gallery-viewer-immersive"
      } gallery-viewer-${item.kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={UI_TEXT.gallery.viewer}
    >
      {controlsVisible && (
        <header>
          <span>{item.name}</span>
          <button
            type="button"
            onClick={rotateMedia}
            aria-label={UI_TEXT.gallery.rotateClockwise}
          >
            {UI_SYMBOLS.rotate}
          </button>
          <button type="button" onClick={onClose} aria-label={UI_TEXT.gallery.closeViewer}>
            {UI_SYMBOLS.close}
          </button>
        </header>
      )}
      <div
        ref={stageRef}
        className="gallery-viewer-stage"
        onTouchStart={startSwipe}
        onTouchEnd={finishSwipe}
      >
        {!controlsVisible && item.kind === "image" && (
          <div
            className="gallery-viewer-backdrop-layer"
            aria-hidden="true"
            onClick={toggleControls}
          >
            <img
              className={`gallery-viewer-backdrop${
                isSideways ? " gallery-viewer-backdrop-sideways" : ""
              }`}
              style={backdropStyle}
              src={item.mediaUrl}
              alt=""
              draggable="false"
            />
          </div>
        )}
        <div className="gallery-viewer-media-frame" style={mediaFrameStyle}>
          {item.kind === "image" ? (
            <img
              className={mediaClassName}
              style={mediaStyle}
              src={item.mediaUrl}
              alt={item.name}
              onLoad={registerImageSize}
              onClick={toggleControls}
            />
          ) : videoFailed ? (
            <div className="gallery-video-error" role="alert">
              <strong>{UI_TEXT.gallery.videoFailed}</strong>
              <span>{UI_TEXT.gallery.videoCompatibility}</span>
            </div>
          ) : (
            <video
              key={item.id}
              className={mediaClassName}
              style={mediaStyle}
              src={item.mediaUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={registerVideoSize}
              onClick={toggleControls}
              onError={() => setVideoFailed(true)}
            />
          )}
        </div>
        {controlsVisible && (
          <>
            <button
              type="button"
              className="gallery-viewer-previous"
              disabled={!hasPrevious}
              onClick={() => onChange(index - 1)}
              aria-label={UI_TEXT.gallery.previous}
            >
              {UI_SYMBOLS.previous}
            </button>
            <button
              type="button"
              className="gallery-viewer-next"
              disabled={!hasNext}
              onClick={() => onChange(index + 1)}
              aria-label={UI_TEXT.gallery.next}
            >
              {UI_SYMBOLS.next}
            </button>
          </>
        )}
      </div>
      {controlsVisible && (
        <footer>{UI_TEXT_FORMAT(index + 1, items.length)}</footer>
      )}
    </div>
  );
}

const UI_TEXT_FORMAT = (current: number, total: number) => `${current} / ${total}`;

function getMediaFrameStyle(
  controlsVisible: boolean,
  isSideways: boolean,
  mediaSize: MediaSize | null,
  stageSize: StageSize | null,
): CSSProperties | undefined {
  if (controlsVisible) return undefined;
  const resolvedSize = mediaSize ?? stageSize;
  if (!resolvedSize) return undefined;
  const width = isSideways ? resolvedSize.height : resolvedSize.width;
  const height = isSideways ? resolvedSize.width : resolvedSize.height;
  return { aspectRatio: `${width} / ${height}` };
}
