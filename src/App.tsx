import { useState, useRef, useEffect, useCallback } from "react";
import gsap from "gsap";

// ==========================================
// Card Data & Type Definitions
// ==========================================
interface CardData {
  id: number;
  src: string;
  alt: string;
  objectPosition?: string;
}

// ==========================================
// Coverflow layout constants — tarot spread on a table (flat arc)
// ==========================================
const CF_ANGLE_STEP = 0.11; // radians between cards along the arc
const CF_CENTER_SCALE = 1.3; // active card is bigger
const CF_NEIGHBOR_SCALE = 0.92; // first neighbor baseline scale
// Visible window is asymmetric so the total is exactly 8 with the active as the 5th card.
// (4 to the left + 1 active + 3 to the right = 8)
const CF_VISIBLE_LEFT = 4;
const CF_VISIBLE_RIGHT = 3;

const CARDS: CardData[] = [
  {
    id: 1,
    src: "/img/slider/4 - eva_converted.avif",
    alt: "Eva",
    objectPosition: "center 15%",
  },
  {
    id: 2,
    src: "/img/slider/2 - blood angel_converted.avif",
    alt: "Blood Angels",
    objectPosition: "center 15%",
  },
  {
    id: 3,
    src: "/img/slider/8 - Mads_converted.avif",
    alt: "Mads Mikkelsen",
    objectPosition: "center 15%",
  },
  {
    id: 4,
    src: "/img/slider/1 - The Last Deflagration_converted.avif",
    alt: "The Last Deflagration",
    objectPosition: "center 15%",
  },
  {
    id: 5,
    src: "/img/slider/2.3 - Protecting my land_converted.avif",
    alt: "Protecting My Land",
    objectPosition: "center 15%",
  },
  {
    id: 6,
    src: "/img/slider/6 - Kvothe_converted.avif",
    alt: "Kvothe",
    objectPosition: "center 15%",
  },
  {
    id: 7,
    src: "/img/slider/3 - ultramarine_converted.avif",
    alt: "Ultramarine",
    objectPosition: "center 15%",
  },
  { id: 8, src: "/img/slider/10 - carmen_converted.avif", alt: "Carmen" },
  {
    id: 9,
    src: "/img/slider/5 - the witcher_converted.avif",
    alt: "The Witcher",
  },
  { id: 10, src: "/img/slider/6 - akito_converted.avif", alt: "Akito" },
  { id: 11, src: "/img/slider/9 - noko_converted.avif", alt: "Noko" },
  { id: 12, src: "/img/slider/11 - Eldar_converted.avif", alt: "Eldar" },
];

// ==========================================
// Main App Component
// ==========================================

export default function App() {
  const [activeIndex, setActiveIndex] = useState(4); // Default to "Protecting My Land" (index 4)
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Drag Gesture States
  const isDragging = useRef(false);
  const startX = useRef(0);
  const dragThreshold = Math.max(30, window.innerWidth * 0.026); // dynamically scaled threshold to trigger carousel shift

  // GSAP Coverflow Transform Calculations
  const updateCarouselPositions = useCallback(() => {
    const length = CARDS.length;
    // Calculate radius dynamically in pixels based on viewport width (1000px at 1920px wide)
    const radius = window.innerWidth * 0.87;

    CARDS.forEach((_, i) => {
      const cardEl = cardRefs.current[i];
      if (!cardEl) return;

      // Calculate circular shortest path delta
      let diff = i - activeIndex;
      if (diff > length / 2) {
        diff -= length;
      } else if (diff < -length / 2) {
        diff += length;
      }

      const absDiff = Math.abs(diff);
      // Visible when within the per-side window (active counts as the 5th from the left)
      const isVisible =
        diff === 0
          ? true
          : diff < 0
            ? absDiff <= CF_VISIBLE_LEFT
            : absDiff <= CF_VISIBLE_RIGHT;

      // Cards follow a circular arc (like tarot cards fanned on a table).
      // theta = angle from center along the arc.
      const theta = diff * CF_ANGLE_STEP;
      const x = radius * Math.sin(theta);
      const y = radius * (1 - Math.cos(theta)); // gentle droop toward edges
      const rotation = theta * (180 / Math.PI); // tilt to follow arc tangent
      const scale =
        diff === 0 ? CF_CENTER_SCALE : CF_NEIGHBOR_SCALE - (absDiff - 1) * 0.05;
      const opacity = isVisible ? 1 : 0; // kartu di luar window disembunyikan
      const zIndex = diff === 0 ? 100 : 90 - absDiff * 10;

      // Fix immediate depth layering + clear any leftover 3D transforms
      // Disable interaction on hidden cards so they don't block clicks
      gsap.set(cardEl, {
        zIndex,
        pointerEvents: isVisible ? "auto" : "none",
        rotateY: 0,
        rotateX: 0,
        z: 0,
      });

      gsap.to(cardEl, {
        x,
        y,
        rotation,
        scale,
        opacity,
        duration: 0.65,
        ease: "power3.out",
        overwrite: "auto",
      });
    });
  }, [activeIndex]);

  // Update layout when active index changes or window resizes
  useEffect(() => {
    updateCarouselPositions();
    window.addEventListener("resize", updateCarouselPositions);
    return () => window.removeEventListener("resize", updateCarouselPositions);
  }, [updateCarouselPositions]);

  // Bind keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev - 1 + CARDS.length) % CARDS.length);
      } else if (e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev + 1) % CARDS.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click handler: centering clicked card
  const handleCardClick = (index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  // Drag (Swipe) Handlers
  const handleDragStart = (clientX: number) => {
    isDragging.current = true;
    startX.current = clientX;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging.current) return;
    const deltaX = clientX - startX.current;

    if (deltaX > dragThreshold) {
      // Swipe Right -> show previous card (looping)
      setActiveIndex((prev) => (prev - 1 + CARDS.length) % CARDS.length);
      isDragging.current = false;
    } else if (deltaX < -dragThreshold) {
      // Swipe Left -> show next card (looping)
      setActiveIndex((prev) => (prev + 1) % CARDS.length);
      isDragging.current = false;
    }
  };

  const handleDragEnd = () => {
    isDragging.current = false;
  };

  // ==========================================
  // Dialog (Modal) Handlers
  // ==========================================
  const openDialog = () => {
    setIsDialogOpen(true);
    requestAnimationFrame(() => {
      gsap.fromTo(
        ".dialog-container",
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" },
      );
    });
  };

  const closeDialog = () => {
    gsap.to(".dialog-container", {
      scale: 0.8,
      opacity: 0,
      duration: 0.25,
      ease: "power2.in",
      onComplete: () => setIsDialogOpen(false),
    });
  };

  // Close dialog on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    if (isDialogOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isDialogOpen]);

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col justify-between items-center select-none">
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd1f132a825d35434b9_1.avif"
        className="w-full"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd1364d9c6bc865110b_2.avif"
        className="w-full absolute inset-0"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd16820b932857bffbf_4%20-%20English%20and%20Spanish.avif"
        className="w-full absolute inset-0"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd0176da2285122e909_2%2C2%20-%20Select%20-%20English.avif"
        className="w-full absolute inset-0"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd0633293356c20a46a_2%2C3%20-%20arrow%20left.avif"
        className="w-full absolute inset-0"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd0e65d09068073cad7_2%2C3%20-%20arrow%20right.avif"
        className="w-full absolute inset-0"
        alt=""
      />
      <div className="absolute inset-be-0 bottom-[5.1vw]">
        <div className="ml-[1.2vw] w-[15vw]">
          <div className="h-[4.4vw] w-full z-20 relative flex">
            <div
              className="w-[25%] cursor-pointer"
              onClick={() =>
                setActiveIndex(
                  (prev) => (prev - 1 + CARDS.length) % CARDS.length,
                )
              }
            />
            <div className="w-[50%] cursor-pointer" onClick={openDialog} />
            <div
              className="w-[25%] cursor-pointer"
              onClick={() =>
                setActiveIndex((prev) => (prev + 1) % CARDS.length)
              }
            />
          </div>
          {/* <p className="text-7xl">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Magnam
            tempore possimus, molestias, voluptas corporis libero quaerat
            ducimus labore assumenda sunt est. Voluptatum, voluptates quae
            dignissimos pariatur unde sunt qui dolor!
          </p> */}
        </div>
      </div>
      <div className="absolute inset-x-0 top-[9vw]">
        <div
          ref={containerRef}
          className="w-screen h-[34vw] relative flex justify-center items-center select-none overflow-visible touch-none z-10"
          style={{
            transformStyle: "preserve-3d",
          }}
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
        >
          {CARDS.map((card, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={card.id}
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                onClick={() => handleCardClick(index)}
                className={`absolute w-[22vw] h-[31vw] rounded-2xl overflow-hidden ${
                  isActive
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer hover:brightness-110"
                }`}
                style={{
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "hidden",
                }}
              >
                <img
                  src={card.src}
                  alt={card.alt}
                  className="w-full h-full object-cover select-none pointer-events-none rounded-lg"
                  style={
                    card.objectPosition
                      ? { objectPosition: card.objectPosition }
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          Selection Dialog Overlay (GSAP animated)
          ========================================== */}
      {isDialogOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={closeDialog}
        >
          <div
            className="dialog-container relative flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background dialog */}
            <div className="relative">
              <img
                src="/img/dialog/3_converted.avif"
                alt="dialog"
                className="max-w-[90vw] max-h-[90vh] object-contain select-none pointer-events-none"
              />
              <div className="absolute inset-0 left-0 top-[7vw] h-[34vw] max-w-[70vw] mx-auto z-10">
                <div className="flex gap-6">
                  <iframe
                    title="vimeo-player"
                    src="https://player.vimeo.com/video/347119375?h=1699409fe2"
                    className="w-[46.8vw] h-[25.8vw] m-6"
                    frameBorder="0"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                    allowFullScreen
                  />
                  <div className="w-[15.2vw] h-[25.8vw] m-6 flex flex-col gap-4">
                    <iframe
                      title="vimeo-player-1"
                      src="https://player.vimeo.com/video/347119375?h=1699409fe2"
                      className="h-[8.4vw] w-full rounded-lg"
                      frameBorder="0"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                      allowFullScreen
                    />
                    <iframe
                      title="vimeo-player-2"
                      src="https://player.vimeo.com/video/76979871"
                      className="h-[8.4vw] w-full rounded-lg"
                      frameBorder="0"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                      allowFullScreen
                    />
                    <iframe
                      title="vimeo-player-3"
                      src="https://player.vimeo.com/video/22439234"
                      className="h-[8.4vw] w-full rounded-lg"
                      frameBorder="0"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>
            </div>
            <img
              src="/img/dialog/Button - Subscribe - English_converted.avif"
              className="absolute inset-0 w-full"
              alt=""
            />
            <img
              src="/img/dialog/Button - buy video - English_converted.avif"
              className="absolute inset-0 w-full"
              alt=""
            />
            <img
              src="/img/dialog/Button - comments - English_converted.avif"
              className="absolute inset-0 w-full"
              alt=""
            />
            {/* Close icon */}
            <img
              src="/img/dialog/button - close_converted.avif"
              alt="close"
              className="absolute top-[3%] right-[3%] w-[58%] hover:brightness-110 transition select-none"
            />
            <div
              className="absolute inset-0 left-auto right-12 top-6 h-[3.5vw] w-[3.5vw]"
              onClick={closeDialog}
            />
          </div>
        </div>
      )}
    </div>
  );
}
