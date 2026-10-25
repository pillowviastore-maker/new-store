import { DialogCloseEvent } from '@theme/dialog';
import { clamp, preventDefault, isMobileBreakpoint } from '@theme/utilities';
import { Component } from '@theme/component';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DEFAULT_ZOOM = 1.5;
// Lithella: open full-screen photos at 1x so the whole image fits the phone; double-tap still zooms to DEFAULT_ZOOM.
const START_ZOOM = MIN_ZOOM;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 50;
const DRAG_THRESHOLD = 10;

/**
 * @typedef {object} Refs
 * @property {HTMLImageElement} image - The image element to zoom and drag.
 */

/** @extends {Component<Refs>} */
export class DragZoomWrapper extends Component {
  requiredRefs = ['image'];
  #controller = new AbortController();
  /** @type {number} */
  #scale = START_ZOOM;
  /** @type {number} */
  #initialDistance = 0;
  /** @type {number} */
  #startScale = START_ZOOM;
  /** @type {Point} */
  #translate = { x: 0, y: 0 };
  /** @type {Point} */
  #startPosition = { x: 0, y: 0 };
  /** @type {Point} */
  #startTranslate = { x: 0, y: 0 };
  /** @type {boolean} */
  #isDragging = false;
  /** @type {boolean} */
  #initialized = false;
  /** @type {number | null} */
  #animationFrame = null;
  /** @type {number} */
  #lastTapTime = 0;
  /** @type {Point | null} */
  #lastTapPosition = null;

  /** @type {boolean} */
  #hasDraggedBeyondThreshold = false;

  /** @type {boolean} */
  #hasManualZoom = false;

  /** @type {Point} */
  #swipe = { x: 0, y: 0 };

  /** @type {number} */
  #swipeStartTime = 0;

  get #image() {
    return this.refs.image;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.#image) return;

    this.#initResizeListener();
    window.addEventListener(DialogCloseEvent.eventName, this.#resetZoom);

    if (!isMobileBreakpoint()) return;

    this.#initEventListeners();
    this.#updateTransform();
  }

  #initResizeListener() {
    this.#resizeObserver.observe(this);
  }

  #initEventListeners() {
    if (this.#initialized) return;
    this.#initialized = true;
    const { signal } = this.#controller;
    const options = { passive: false, signal };

    this.addEventListener('touchstart', this.#handleTouchStart, options);
    this.addEventListener('touchmove', this.#handleTouchMove, options);
    this.addEventListener('touchend', this.#handleTouchEnd, options);

    // Initialize transform immediately
    this.#updateTransform();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(DialogCloseEvent.eventName, this.#resetZoom);
    this.#controller.abort();
    this.#resizeObserver.disconnect();
    this.#cancelAnimationFrame();
  }

  #handleResize = () => {
    if (!this.#initialized && isMobileBreakpoint()) {
      this.#initEventListeners();
    }

    if (this.#initialized) {
      this.#requestUpdateTransform();
    }
  };

  #resizeObserver = new ResizeObserver(this.#handleResize);

  /**
   * @param {TouchEvent} event
   */
  #handleTouchStart = (event) => {
    preventDefault(event);

    const touchCount = event.touches.length;

    if (touchCount === 2) {
      // Early exit if touches are invalid
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      if (!touch1 || !touch2) return;

      // Avoid object allocation by passing touches directly
      this.#startZoomGestureFromTouches(touch1, touch2);
    } else if (touchCount === 1) {
      const touch = event.touches[0];
      if (!touch) return;

      // Use performance.now() for better precision and performance
      const currentTime = performance.now();
      const timeSinceLastTap = currentTime - this.#lastTapTime;

      // Early exit if too much time has passed
      if (timeSinceLastTap >= DOUBLE_TAP_DELAY) {
        this.#storeTapInfo(currentTime, touch);
        this.#startDragGestureFromTouch(touch);
        return;
      }

      // Only check distance if we have a previous tap within time window
      if (this.#lastTapPosition) {
        // Distance calculation with early exit
        const distance = getDistance(touch, this.#lastTapPosition);

        if (distance < DOUBLE_TAP_DISTANCE) {
          // This is a double-tap, handle zoom toggle
          this.#handleDoubleTapFromTouch(touch);
          this.#lastTapTime = 0; // Reset to prevent triple-tap
          this.#lastTapPosition = null;
          return;
        }
      }

      // Store tap info for potential double-tap detection
      this.#storeTapInfo(currentTime, touch);
      this.#startDragGestureFromTouch(touch);
    }
  };

  /**
   * Start a zoom gesture with two touches
   * @param {Touch} touch1
   * @param {Touch} touch2
   */
  #startZoomGestureFromTouches(touch1, touch2) {
    // Calculate initial distance between touches
    this.#initialDistance = getDistance(touch1, touch2);
    this.#startScale = this.#scale;
    this.#isDragging = false;
  }

  /**
   * Start a drag gesture with a single touch
   * @param {Touch} touch
   */
  #startDragGestureFromTouch(touch) {
    this.#startPosition = { x: touch.clientX, y: touch.clientY };
    this.#startTranslate = { x: this.#translate.x, y: this.#translate.y };
    this.#isDragging = true;
    this.#hasDraggedBeyondThreshold = false;
    this.#swipeStartTime = performance.now();
    if (this.#scale <= MIN_ZOOM + 0.01) {
      const ctx = this.#slideContext();
      if (ctx) this.#primeNeighbours(ctx);
    }
  }

  /**
   * Store tap information for double-tap detection
   * @param {number} currentTime
   * @param {Touch} touch
   */
  #storeTapInfo(currentTime, touch) {
    this.#lastTapTime = currentTime;
    this.#lastTapPosition = { x: touch.clientX, y: touch.clientY };
  }

  /**
   * Handle double-tap zoom toggle from touch
   * @param {Touch} touch - The touch where the double-tap occurred
   */
  #handleDoubleTapFromTouch(touch) {
    const containerCenter = {
      x: this.clientWidth / 2,
      y: this.clientHeight / 2,
    };

    let targetZoom;

    // If manual zoom has been used, reset to 1x
    if (this.#hasManualZoom) {
      targetZoom = MIN_ZOOM; // 1x
      this.#hasManualZoom = false; // Reset the flag
      this.#translate = { x: 0, y: 0 }; // Center the image
    } else {
      // Toggle between zoom levels: 1x ↔ 1.5x
      const tolerance = 0.05; // Small tolerance for floating point comparison

      if (Math.abs(this.#scale - MIN_ZOOM) < tolerance) {
        // Currently at 1x, go to 1.5x
        targetZoom = DEFAULT_ZOOM;
      } else {
        // Currently at 1.5x or any other level, go to 1x
        targetZoom = MIN_ZOOM;
      }
    }

    // If we're not going to 1x, adjust translation to center zoom on the tap point
    if (targetZoom !== MIN_ZOOM) {
      const oldScale = this.#scale;
      this.#scale = Math.min(MAX_ZOOM, targetZoom);

      // Calculate the distance from tap point to container center
      const distanceFromCenter = {
        x: touch.clientX - containerCenter.x,
        y: touch.clientY - containerCenter.y,
      };

      // Adjust translation to center zoom on the tap point
      const scaleDelta = this.#scale / oldScale - 1.0;
      this.#translate.x -= (distanceFromCenter.x * scaleDelta) / this.#scale;
      this.#translate.y -= (distanceFromCenter.y * scaleDelta) / this.#scale;
    } else {
      // Going to 1x, set the scale and center the image
      this.#scale = targetZoom;
      this.#translate = { x: 0, y: 0 }; // Center the image when going to 1x
    }

    this.#requestUpdateTransform();
  }

  /**
   * @param {TouchEvent} event
   */
  #handleTouchMove = (event) => {
    preventDefault(event);

    const touchCount = event.touches.length;

    if (touchCount === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      if (touch1 && touch2) {
        this.#processZoomGesture(touch1, touch2);
      }
    } else if (touchCount === 1 && this.#isDragging) {
      const touch = event.touches[0];
      if (touch) {
        this.#processDragGesture(touch);
      }
    }
  };

  /**
   * Process zoom gesture from touches
   * @param {Touch} touch1
   * @param {Touch} touch2
   */
  #processZoomGesture(touch1, touch2) {
    // Calculate midpoint directly without object allocation
    const midX = (touch1.clientX + touch2.clientX) / 2;
    const midY = (touch1.clientY + touch2.clientY) / 2;

    // Calculate current distance between touches
    const currentDistance = getDistance(touch1, touch2);

    const oldScale = this.#scale;

    // Calculate and apply new scale
    const newScale = (currentDistance / this.#initialDistance) * this.#startScale;
    this.#scale = clamp(newScale, MIN_ZOOM, MAX_ZOOM);

    // Mark that manual zoom has been used
    this.#hasManualZoom = true;

    // Adjust translation to keep the pinch midpoint stationary
    const containerCenterX = this.clientWidth / 2;
    const containerCenterY = this.clientHeight / 2;

    const distanceFromCenterX = midX - containerCenterX;
    const distanceFromCenterY = midY - containerCenterY;

    // Calculate how the image position needs to change to keep the midpoint stationary
    const scaleDelta = this.#scale / oldScale - 1.0;

    // Apply correction to prevent zooming on the opposite side of the midpoint
    this.#translate.x -= (distanceFromCenterX * scaleDelta) / this.#scale;
    this.#translate.y -= (distanceFromCenterY * scaleDelta) / this.#scale;

    this.#requestUpdateTransform();
    this.#isDragging = false;
  }

  /**
   * Process drag gesture from touch
   * @param {Touch} touch
   */
  #processDragGesture(touch) {
    // Check if we've moved beyond the drag threshold
    const distance = getDistance(touch, this.#startPosition);

    if (!this.#hasDraggedBeyondThreshold && distance < DRAG_THRESHOLD) {
      // Movement is too small, don't process as drag yet
      return;
    }

    this.#hasDraggedBeyondThreshold = true;

    // Calculate movement deltas for translation
    const dx = touch.clientX - this.#startPosition.x;
    const dy = touch.clientY - this.#startPosition.y;

    // Lithella: at 1x a sideways drag is a swipe to the next or previous photo.
    if (this.#scale <= MIN_ZOOM + 0.01) {
      this.#swipe = { x: dx, y: dy };
      if (Math.abs(dx) > Math.abs(dy)) this.#dragSlides(dx);
      return;
    }

    // Calculate new translation directly
    this.#translate.x = this.#startTranslate.x + dx / this.#scale;
    this.#translate.y = this.#startTranslate.y + dy / this.#scale;

    this.#requestUpdateTransform();
  }

  /**
   * @param {TouchEvent} event
   */
  #handleTouchEnd = (event) => {
    if (event.touches.length === 0) {
      const swipe = this.#swipe;
      this.#swipe = { x: 0, y: 0 };
      if (this.#scale <= MIN_ZOOM + 0.01 && (swipe.x || swipe.y)) {
        const speed = Math.abs(swipe.x) / Math.max(performance.now() - this.#swipeStartTime, 1);
        const sideways = Math.abs(swipe.x) > Math.abs(swipe.y);
        const far = Math.abs(swipe.x) > this.clientWidth * 0.22;
        this.#settleSlides(sideways && (far || (speed > 0.35 && Math.abs(swipe.x) > 24)) ? (swipe.x < 0 ? 1 : -1) : 0);
      }

      this.#isDragging = false;
      this.#requestUpdateTransform();

      this.#hasDraggedBeyondThreshold = false;
    }
  };

  /** @returns {{dialog: HTMLElement & {selectThumbnail?: Function}, list: HTMLElement, index: number, count: number} | null} */
  #slideContext() {
    const dialog = /** @type {(HTMLElement & {selectThumbnail?: Function, loadHighResolutionImage?: Function}) | null} */ (this.closest('zoom-dialog'));
    const item = this.closest('li');
    const list = item?.parentElement;
    if (!dialog || !item || !list) return null;
    const items = Array.from(list.children);
    return { dialog, list, index: items.indexOf(item), count: items.length };
  }

  /**
   * Lithella: moves the photos with the finger (the neighbour slides in), with resistance at either end.
   * @param {number} dx
   */
  #dragSlides(dx) {
    const ctx = this.#slideContext();
    if (!ctx) return;
    const atEdge = (dx > 0 && ctx.index === 0) || (dx < 0 && ctx.index === ctx.count - 1);
    if (!ctx.list.classList.contains('is-swiping')) {
      ctx.list.classList.add('is-swiping');
      this.#primeNeighbours(ctx);
    }
    ctx.list.classList.remove('is-settling');
    ctx.list.style.setProperty('--swipe-dx', `${atEdge ? dx * 0.3 : dx}px`);
  }

  /**
   * Loads the photos on either side so they are already there while they slide in.
   * @param {{dialog: HTMLElement & {loadHighResolutionImage?: Function}, list: HTMLElement, index: number}} ctx
   */
  #primeNeighbours(ctx) {
    [ctx.index - 1, ctx.index + 1].forEach((i) => {
      const item = ctx.list.children[i];
      if (!(item instanceof HTMLElement)) return;
      const image = item.querySelector('img');
      if (image && image.loading === 'lazy') image.loading = 'eager';
      ctx.dialog.loadHighResolutionImage?.(item);
    });
  }

  /**
   * Glides to the next (1) or previous (-1) photo, or back into place (0).
   * @param {number} step
   */
  #settleSlides(step) {
    const ctx = this.#slideContext();
    if (!ctx) return;
    const next = ctx.index + step;
    const valid = step !== 0 && next >= 0 && next < ctx.count && typeof ctx.dialog.selectThumbnail === 'function';
    const { list } = ctx;
    list.classList.remove('is-swiping');
    list.classList.add('is-settling');
    list.style.setProperty('--swipe-dx', valid ? `${-step * this.clientWidth}px` : '0px');
    window.setTimeout(() => {
      list.classList.remove('is-settling');
      list.style.setProperty('--swipe-dx', '0px');
      if (valid) ctx.dialog.selectThumbnail?.(next, { behavior: 'instant' });
    }, 340);
  }

  /**
   * Constrain image translation to keep it within the viewport
   */
  #constrainTranslation() {
    const containerWidth = this.clientWidth;
    const containerHeight = this.clientHeight;
    if (!containerWidth || !containerHeight || !this.#image) return;

    // Keep scale between MIN_ZOOM (1) and MAX_ZOOM (5)
    this.#scale = clamp(this.#scale, MIN_ZOOM, MAX_ZOOM);

    // At minimum zoom (1x), the full image should be visible with no dragging allowed
    if (this.#scale <= MIN_ZOOM) {
      this.#translate.x = 0;
      this.#translate.y = 0;
      return;
    }

    // Get wrapper dimensions
    const wrapperRect = this.getBoundingClientRect();

    // Calculate ACTUAL image content dimensions at current zoom
    // The image element may fill the wrapper, but the content has its own aspect ratio
    const imageElement = this.#image;
    let naturalWidth, naturalHeight;

    // Try to get natural dimensions
    if (imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0) {
      naturalWidth = imageElement.naturalWidth;
      naturalHeight = imageElement.naturalHeight;
    } else {
      // Fallback: assume square image if we can't get natural dimensions
      naturalWidth = wrapperRect.width;
      naturalHeight = wrapperRect.width;
    }

    // Calculate how the image fits within the wrapper (object-fit: contain behavior)
    const imageAspectRatio = naturalWidth / naturalHeight;
    const wrapperAspectRatio = wrapperRect.width / wrapperRect.height;

    let actualImageWidth, actualImageHeight;

    if (imageAspectRatio > wrapperAspectRatio) {
      // Image is wider - width fits exactly, height is smaller (letterboxed top/bottom)
      actualImageWidth = wrapperRect.width;
      actualImageHeight = actualImageWidth / imageAspectRatio;
    } else {
      // Image is taller - height fits exactly, width is smaller (letterboxed left/right)
      actualImageHeight = wrapperRect.height;
      actualImageWidth = actualImageHeight * imageAspectRatio;
    }

    // Apply current zoom scale
    const scaledImageWidth = actualImageWidth * this.#scale;
    const scaledImageHeight = actualImageHeight * this.#scale;

    // SIMPLE APPROACH: Calculate constraints directly from image content dimensions
    // If image content is larger than wrapper, calculate max translation directly

    const horizontalOverflow = Math.max(0, scaledImageWidth - wrapperRect.width);
    const verticalOverflow = Math.max(0, scaledImageHeight - wrapperRect.height);

    // Max translation is half the overflow (since image starts centered)
    const maxTranslateX = horizontalOverflow / 2 / this.#scale;
    const maxTranslateY = verticalOverflow / 2 / this.#scale;

    // Apply symmetric constraints (object-fit: contain behavior)
    // Image starts centered, can move maxTranslate in each direction
    this.#translate.x = clamp(this.#translate.x, -maxTranslateX, maxTranslateX);
    this.#translate.y = clamp(this.#translate.y, -maxTranslateY, maxTranslateY);

    // Apply final transforms to CSS
    this.style.setProperty('--drag-zoom-scale', this.#scale.toString());
    this.style.setProperty('--drag-zoom-translate-x', `${this.#translate.x}px`);
    this.style.setProperty('--drag-zoom-translate-y', `${this.#translate.y}px`);
  }

  /**
   * Request an animation frame to update the transform
   */
  #requestUpdateTransform = () => {
    if (!this.#animationFrame) {
      this.#animationFrame = requestAnimationFrame(this.#updateTransform);
    }
  };

  /**
   * Cancel any pending animation frame
   */
  #cancelAnimationFrame() {
    if (this.#animationFrame) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
  }

  #updateTransform = () => {
    this.#animationFrame = null;

    this.#constrainTranslation();
    this.style.setProperty('--drag-zoom-scale', this.#scale.toString());
    this.style.setProperty('--drag-zoom-translate-x', `${this.#translate.x}px`);
    this.style.setProperty('--drag-zoom-translate-y', `${this.#translate.y}px`);
  };

  /**
   * Reset zoom to the starting state (1x scale, centered position)
   * Called when zoom is exited/closed
   */
  #resetZoom = () => {
    // Reset scale and translation to defaults
    this.#scale = START_ZOOM;
    this.#startScale = START_ZOOM;
    this.#translate.x = 0;
    this.#translate.y = 0;

    // Reset gesture state to prevent interference on next zoom open
    this.#startPosition = { x: 0, y: 0 };
    this.#startTranslate = { x: 0, y: 0 };
    this.#isDragging = false;
    this.#lastTapTime = 0;
    this.#lastTapPosition = null;
    this.#hasDraggedBeyondThreshold = false;

    // Update CSS properties to reflect reset state
    this.style.setProperty('--drag-zoom-scale', START_ZOOM.toString());
    this.style.setProperty('--drag-zoom-translate-x', '0px');
    this.style.setProperty('--drag-zoom-translate-y', '0px');
  };

  destroy() {
    this.#controller.abort();
    this.#cancelAnimationFrame();
  }
}

/**
 * Calculate distance between two points or touches
 * @param {Point | Touch} point1 - First point or touch
 * @param {Point | Touch} point2 - Second point or touch
 * @returns {number} Distance between the points
 */
function getDistance(point1, point2) {
  // Handle both Point objects (x, y) and Touch objects (clientX, clientY)
  const x1 = /** @type {Point} */ (point1).x ?? /** @type {Touch} */ (point1).clientX;
  const y1 = /** @type {Point} */ (point1).y ?? /** @type {Touch} */ (point1).clientY;
  const x2 = /** @type {Point} */ (point2).x ?? /** @type {Touch} */ (point2).clientX;
  const y2 = /** @type {Point} */ (point2).y ?? /** @type {Touch} */ (point2).clientY;

  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

if (!customElements.get('drag-zoom-wrapper')) {
  customElements.define('drag-zoom-wrapper', DragZoomWrapper);
}

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {HTMLElement} ZoomDialogElement
 * @property {Function} close - Method to close the zoom dialog
 */
