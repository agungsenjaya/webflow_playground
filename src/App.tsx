import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import gsap from "gsap";

// ==========================================
// Card Data & Type Definitions
// ==========================================
interface VideoTutorial {
  id: number;
  title: string;
  category: string;
  materials: string[];
  scales: string[];
  img: string;
  videos: {
    en: string[];
    es: string[];
  };
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

// ==========================================
// Video panel flip constants — 3D card flip between New/Old videos
// ==========================================
const FLIP_DURATION = 0.5; // seconds for one flip (lower = snappier)
const FLIP_PERSPECTIVE = 1000; // 3D depth (higher = subtler, lower = dramatic)
const FLIP_LIFT = -10; // px the card rises mid-flip (gravity arc: up then land)

// ==========================================
// Main App Component
// ==========================================

export default function App() {
  const [activeIndex, setActiveIndex] = useState(4); // Default to "Protecting My Land" (index 4)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tutorials, setTutorials] = useState<VideoTutorial[]>([]);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [activeVideoUrl, setActiveVideoUrl] = useState<string>("");
  const [isMaterialsVisible, setIsMaterialsVisible] = useState(false);
  const [isScalesVisible, setIsScalesVisible] = useState(false);
  const [videoMode, setVideoMode] = useState<"new" | "old">("new");

  // Coverflow data is driven by fetched tutorials filtered by the active category.
  // Default to 'new'; switching to 'old' via handleSwitchVideosClick refilters this.
  const cards = useMemo(
    () => tutorials.filter((t) => t.category === videoMode),
    [tutorials, videoMode],
  );

  // Fetch tutorial data from json-server and set initial hidden state for materials and scales
  useEffect(() => {
    fetch("http://localhost:3001/list-video-tutorials")
      .then((res) => res.json())
      .then((data: VideoTutorial[]) => {
        setTutorials(data);
      })
      .catch((err) => console.error("Error fetching tutorials:", err));

    // Hide materials by default on load
    gsap.set(".skin, .metal, .fabric, .terrain, .leather, .hair", {
      opacity: 0,
      y: 100,
    });

    // Hide scales by default on load (moving to the left)
    gsap.set(".bust, .\\37 5mm, .\\35 4mm", {
      opacity: 0,
      x: -120,
    });

    // Setup 3D flip starting states for new/old videos panels.
    // Both panels are stacked in the same place. The flip relies on
    // backfaceVisibility:hidden so each face only shows when facing the viewer.
    // transformPerspective gives each panel its own 3D depth (no parent perspective needed).
    gsap.set(".new-videos, .old-videos", {
      backfaceVisibility: "hidden",
      transformStyle: "preserve-3d",
      transformOrigin: "center center",
      transformPerspective: FLIP_PERSPECTIVE,
    });

    // Old videos start facing away (rotated 180deg) so its back is hidden
    gsap.set(".old-videos", {
      rotateY: 180,
      pointerEvents: "none",
    });

    // New videos face the viewer
    gsap.set(".new-videos", {
      rotateY: 0,
      pointerEvents: "auto",
    });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isFirstLoad = useRef(true);

  // Drag Gesture States
  const isDragging = useRef(false);
  const startX = useRef(0);
  const dragThreshold = Math.max(30, window.innerWidth * 0.026); // dynamically scaled threshold to trigger carousel shift

  // GSAP Coverflow Transform Calculations
  const updateCarouselPositions = useCallback(() => {
    const length = cards.length;
    if (length === 0) return; // data not loaded yet
    // Calculate radius dynamically in pixels based on viewport width (1000px at 1920px wide)
    const radius = window.innerWidth * 0.87;

    // Pre-calculate all positions and attributes
    const cardTransforms = cards.map((_, i) => {
      let diff = i - activeIndex;
      if (diff > length / 2) {
        diff -= length;
      } else if (diff < -length / 2) {
        diff += length;
      }

      const absDiff = Math.abs(diff);
      const isVisible =
        diff === 0
          ? true
          : diff < 0
            ? absDiff <= CF_VISIBLE_LEFT
            : absDiff <= CF_VISIBLE_RIGHT;

      const theta = diff * CF_ANGLE_STEP;
      const x = radius * Math.sin(theta);
      const y = radius * (1 - Math.cos(theta));
      const rotation = theta * (180 / Math.PI);
      const scale =
        diff === 0 ? CF_CENTER_SCALE : CF_NEIGHBOR_SCALE - (absDiff - 1) * 0.05;
      const opacity = isVisible ? 1 : 0;
      const zIndex = diff === 0 ? 100 : 90 - absDiff * 10;

      return { i, diff, isVisible, x, y, rotation, scale, opacity, zIndex };
    });

    if (isFirstLoad.current) {
      // 1. Instantly hide all cards, reset rotations, set z-index
      cardTransforms.forEach((t) => {
        const cardEl = cardRefs.current[t.i];
        if (!cardEl) return;
        gsap.set(cardEl, {
          zIndex: t.zIndex,
          pointerEvents: t.isVisible ? "auto" : "none",
          rotateY: 0,
          rotateX: 0,
          z: 0,
          opacity: 0,
        });
      });

      // 2. Filter visible cards
      const visibleCardTransforms = cardTransforms.filter((t) => t.isVisible);

      // We want cards on the outside to fall first, moving inwards, with the center (activeIndex) falling last.
      // We can calculate the distance/difference in index from the activeIndex.
      // Maximum distance from activeIndex among visible cards:
      // Left side goes up to 4 cards away, right side goes up to 3 cards away.
      // Let's find the absolute diff from activeIndex for each, and invert it so larger distance falls first.
      const maxDistance = Math.max(
        ...visibleCardTransforms.map((t) => Math.abs(t.diff)),
      );

      // 3. For each visible card, animate from above with delay based on distance to center
      visibleCardTransforms.forEach((t) => {
        const cardEl = cardRefs.current[t.i];
        if (!cardEl) return;

        // Distance from center: 0 for active card, 1 for immediate neighbors, etc.
        const distanceToCenter = Math.abs(t.diff);
        // Delay is smaller for outer cards, larger for inner cards.
        // E.g., if maxDistance is 4:
        // distance 4 -> delay = (4 - 4) * delayStep = 0
        // distance 3 -> delay = (4 - 3) * delayStep = 0.15
        // distance 0 (center) -> delay = (4 - 0) * delayStep = 0.6
        const delayStep = 0.15; // adjust this for the speed of the inward progression
        const calculatedDelay = (maxDistance - distanceToCenter) * delayStep;

        gsap.fromTo(
          cardEl,
          {
            x: t.x,
            y: -900,
            rotation: 0,
            scale: t.scale,
            opacity: 1,
          },
          {
            x: t.x,
            y: t.y,
            rotation: t.rotation,
            scale: t.scale,
            opacity: 1,
            duration: 2.0,
            delay: calculatedDelay,
            ease: "power2.out",
            overwrite: "auto",
            onComplete: () => {
              // Set isFirstLoad to false when the center card (last card) finishes its animation
              if (t.diff === 0) {
                isFirstLoad.current = false;
              }
            },
          },
        );
      });
    } else {
      // Normal carousel updates (drag / arrow navigation)
      cardTransforms.forEach((t) => {
        const cardEl = cardRefs.current[t.i];
        if (!cardEl) return;

        gsap.set(cardEl, {
          zIndex: t.zIndex,
          pointerEvents: t.isVisible ? "auto" : "none",
          rotateY: 0,
          rotateX: 0,
          z: 0,
        });

        gsap.to(cardEl, {
          x: t.x,
          y: t.y,
          rotation: t.rotation,
          scale: t.scale,
          opacity: t.opacity,
          duration: 0.65,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
    }
  }, [activeIndex, cards]);

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
        setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length);
      } else if (e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev + 1) % cards.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cards.length]);

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
      setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length);
      isDragging.current = false;
    } else if (deltaX < -dragThreshold) {
      // Swipe Left -> show next card (looping)
      setActiveIndex((prev) => (prev + 1) % cards.length);
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
    // The active coverflow card IS the tutorial (data-driven now), so no fuzzy lookup needed.
    const matchedTutorial = cards[activeIndex];

    // Get videos based on language
    const currentVideos = matchedTutorial
      ? language === "en"
        ? matchedTutorial.videos.en
        : matchedTutorial.videos.es
      : [];

    // Check if there are no videos at all for the current card
    if (!currentVideos || currentVideos.length === 0) {
      alert("Tutorial videos for this model are not linked yet.");
      return;
    }

    // Set first video as active video URL
    setActiveVideoUrl(currentVideos[0]);

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

  // Handle materials-trigger click:
  // 1. Scale bounce on .materials and .scale classes
  // 2. Stagger slide up animation for .skin, .metal, .fabric, .terrain, .leather, .hair (or reverse hide if already visible)
  const handleMaterialsTriggerClick = () => {
    // 1. Scale Bounce
    gsap.fromTo(
      ".materials, [class*='Scale']",
      { scale: 1 },
      {
        scale: 0.9,
        x: -30,
        y: 40,
        duration: 0.35,
        ease: "power.out()",
        yoyo: true,
        repeat: 1,
        overwrite: "auto",
      },
    );

    const targetClasses = [
      ".skin",
      ".metal",
      ".fabric",
      ".terrain",
      ".leather",
      ".hair",
    ];
    gsap.killTweensOf(targetClasses);

    if (isMaterialsVisible) {
      // 2. Reverse Stagger (Slide down to hide)
      // Animated in reverse order (hair down to skin) for a clean visual exit
      gsap.to([...targetClasses].reverse(), {
        opacity: 0,
        y: 120,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: () => {
          setIsMaterialsVisible(false);
        },
      });
    } else {
      // 2. Stagger Slide up to show
      gsap.fromTo(
        targetClasses,
        {
          opacity: 0,
          y: 120,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => {
            setIsMaterialsVisible(true);
          },
        },
      );
    }
  };

  // Handle scales-trigger click:
  // 1. Scale bounce on .scales and .scale classes
  // 2. Stagger slide right animation for .bust, .75mm, .54mm (or reverse hide if already visible)
  const handleScalesTriggerClick = () => {
    // 1. Scale Bounce
    gsap.fromTo(
      ".scales, [class*='Scale']",
      { scale: 1 },
      {
        scale: 0.9,
        x: -80, // shift slightly right for bounce feedback
        y: -40,
        duration: 0.35,
        ease: "power.out()",
        yoyo: true,
        repeat: 1,
        overwrite: "auto",
      },
    );

    const targetClasses = [".bust", ".\\37 5mm", ".\\35 4mm"];
    gsap.killTweensOf(targetClasses);

    if (isScalesVisible) {
      // 2. Reverse Stagger (Slide left to hide)
      gsap.to([...targetClasses].reverse(), {
        opacity: 0,
        x: -120,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: () => {
          setIsScalesVisible(false);
        },
      });
    } else {
      // 2. Stagger Slide right to show
      gsap.fromTo(
        targetClasses,
        {
          opacity: 0,
          x: -120,
        },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => {
            setIsScalesVisible(true);
          },
        },
      );
    }
  };

  // Handle switch-videos-trigger click:
  // 3D card flip effect between .new-videos and .old-videos.
  // Both faces are stacked at the same position and rotate together by 180deg.
  // backfaceVisibility:hidden hides the face pointing away, so the swap looks
  // like a single card flipping — no opacity cross-fade needed.
  // The lift uses a gravity arc: decelerate on the way up, accelerate on the
  // way down, peaking at the midpoint (when the card is edge-on at 90deg).
  const handleSwitchVideosClick = () => {
    gsap.killTweensOf(".new-videos, .old-videos");

    const goingToOld = videoMode === "new";
    const dir = goingToOld ? "+=180" : "-=180";
    const hideEl = goingToOld ? ".new-videos" : ".old-videos";
    const showEl = goingToOld ? ".old-videos" : ".new-videos";
    const half = FLIP_DURATION / 2;

    // Disable the face we're flipping away from immediately
    gsap.set(hideEl, { pointerEvents: "none" });

    // Swap category immediately — runs the stagger (cards falling from above)
    // in PARALLEL with the label flip, instead of waiting for it to finish.
    isFirstLoad.current = true;
    setActiveIndex(4); // reset to center of the new category
    setVideoMode(goingToOld ? "old" : "new");

    const tl = gsap.timeline({
      overwrite: "auto",
      onComplete: () => {
        gsap.set(showEl, { pointerEvents: "auto" });
      },
    });

    // Continuous rotation across the whole flip
    tl.to(
      ".new-videos, .old-videos",
      { rotateY: dir, duration: FLIP_DURATION, ease: "power2.inOut" },
      0,
    );
    // Gravity arc: rise decelerates, fall accelerates — peak at the midpoint
    tl.to(
      ".new-videos, .old-videos",
      { y: FLIP_LIFT, duration: half, ease: "power2.out" },
      0,
    );
    tl.to(
      ".new-videos, .old-videos",
      { y: 0, duration: half, ease: "power2.in" },
      half,
    );
  };

  // Close dialog on Escape key

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
        src={
          language === "en"
            ? "https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd16820b932857bffbf_4%20-%20English%20and%20Spanish.avif"
            : "https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd16820b932857bffbf_4%20-%20English%20and%20Spanish.avif" // fallback or different if spanish bg available
        }
        className="w-full absolute inset-0"
        alt=""
      />
      {/* Click zones for switching language / overlay */}
      <div
        className="absolute left-[38vw] top-[3vw] w-[11vw] h-[3vw] z-30 cursor-pointer"
        onClick={() => setLanguage("en")}
      />
      <div
        className="absolute left-[50vw] top-[3vw] w-[11vw] h-[3vw] z-30 cursor-pointer"
        onClick={() => setLanguage("es")}
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
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a570edb9b368e93ffd8d952_new-videos-english_converted.avif"
        className="w-[20vw] absolute inset-0 left-auto right-[9vw] old-videos"
        alt=""
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a570edb973f33068410ce87_old-videos-english_converted.avif"
        className="w-[20vw] absolute inset-0 left-auto right-[9vw] new-videos"
        alt=""
      />
      <div
        className="absolute inset-0 left-auto right-[10vw] bottom-auto h-[9vw] w-[18vw] cursor-pointer z-10 switch-videos-trigger"
        onClick={handleSwitchVideosClick}
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd1d6145832d03b75a4_2%2C9%20-%20Scale%20-%20English.avif"
        className="w-full absolute inset-0 scales"
        alt=""
      />
      <div
        className="absolute inset-0 bottom-auto h-[12vw] w-[15vw] cursor-pointer z-10 scales-trigger"
        onClick={handleScalesTriggerClick}
      />
      <img
        src="/img/scales/3 - les than 54mm - english_converted.avif"
        className="w-full absolute inset-0 54mm"
        alt=""
      />
      <div
        className="absolute inset-0 top-[16.5vw] h-[10vw] w-[6vw] cursor-pointer z-20 scales-54mm"
      />
      <img
        src="/img/scales/2 - more than 75mm - english_converted.avif"
        className="w-full absolute inset-0 75mm"
        alt=""
      />
      <div
        className="absolute inset-0 top-[22.3vw] h-[9vw] w-[6vw] cursor-pointer z-20 scales-75mm"
      />
      <img
        src="/img/scales/1 - busts - English_converted.avif"
        className="w-full absolute inset-0 bust"
        alt=""
      />
      <div
        className="absolute inset-0 top-[29vw] h-[9vw] w-[6vw] cursor-pointer z-20 scales-bust"
      />
      <img
        src="https://cdn.prod.website-files.com/6a02cb170cdbff0075ac40a2/6a2abcd1e65d09068073cb36_2%2C8%20-%20Materials%20-%20English.avif"
        // className="w-full h-full absolute inset-0 object-cover object-bottom materials"
        className="w-full absolute inset-0 materials"
        alt=""
      />
      <div
        className="absolute inset-0 left-[12vw] top-auto h-[6vw] w-[17vw] cursor-pointer z-10 materials-trigger"
        onClick={handleMaterialsTriggerClick}
      />
      <img
        src="/img/materials/1 - skin - english_converted.avif"
        className="w-full absolute inset-0 skin"
        alt=""
      />
      <div className="absolute inset-be-0 me-[27vw] h-[4.5vw] w-[9vw] materials-skin cursor-pointer z-20" />
      <img
        src="/img/materials/2 - metal - english_converted.avif"
        className="w-full absolute inset-0 metal"
        alt=""
      />
      <div className="absolute inset-be-0 me-[15vw] h-[4.5vw] w-[9vw] materials-metal cursor-pointer z-20" />
      <img
        src="/img/materials/3 - fabric - english_converted.avif"
        className="w-full absolute inset-0 fabric"
        alt=""
      />
      <div className="absolute inset-be-0 me-[3.2vw] h-[4.5vw] w-[9vw] materials-fabric cursor-pointer z-20" />
      <img
        src="/img/materials/4  - terrain - english_converted.avif"
        className="w-full absolute inset-0 terrain"
        alt=""
      />
      <div className="absolute inset-be-0 ms-[7.2vw] h-[4.5vw] w-[9vw] materials-terrain cursor-pointer z-20" />
      <img
        src="/img/materials/5 - leather - english_converted.avif"
        className="w-full absolute inset-0 leather"
        alt=""
      />
      <div className="absolute inset-be-0 ms-[20.8vw] h-[4.5vw] w-[9vw] materials-leather cursor-pointer z-20" />
      <img
        src="/img/materials/6 - hair - english_converted.avif"
        className="w-full absolute inset-0 hair"
        alt=""
      />
      <div className="absolute inset-be-0 ms-[31.8vw] h-[4.5vw] w-[9vw] materials-hair cursor-pointer z-20" />
      <div className="absolute inset-be-0 bottom-[5.1vw]">
        <div className="ml-[1.2vw] w-[15vw]">
          <div className="h-[4.4vw] w-full z-20 relative flex">
            <div
              className="w-[25%] cursor-pointer"
              onClick={() =>
                setActiveIndex(
                  (prev) => (prev - 1 + cards.length) % cards.length,
                )
              }
            />
            <div className="w-[50%] cursor-pointer" onClick={openDialog} />
            <div
              className="w-[25%] cursor-pointer"
              onClick={() =>
                setActiveIndex((prev) => (prev + 1) % cards.length)
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
          {cards.map((card, index) => {
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
                  src={card.img}
                  alt={card.title}
                  className="w-full h-full object-cover select-none pointer-events-none rounded-lg"
                  style={{ objectPosition: "center 15%" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          Selection Dialog Overlay (GSAP animated)
          ========================================== */}
      {isDialogOpen &&
        (() => {
          // The active coverflow card IS the tutorial — direct lookup, no fuzzy match.
          const matchedTutorial = cards[activeIndex];
          const currentVideos = matchedTutorial
            ? language === "en"
              ? matchedTutorial.videos.en
              : matchedTutorial.videos.es
            : [];

          // Main video to show is either activeVideoUrl, or falls back to the first available video
          const mainVideoSrc =
            activeVideoUrl ||
            (currentVideos.length > 0 ? currentVideos[0] : "");
          // Sidebar videos are the other videos (excluding the currently active main video, up to 3)
          const sidebarVideos = currentVideos
            .filter((v) => v !== mainVideoSrc)
            .slice(0, 3);

          return (
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
                      {mainVideoSrc ? (
                        <iframe
                          title="vimeo-player"
                          src={`${mainVideoSrc}?autoplay=1`}
                          className="w-[46.8vw] h-[25.8vw] m-6 rounded-lg"
                          frameBorder="0"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                          allowFullScreen
                        />
                      ) : (
                        <div className="w-[46.8vw] h-[25.8vw] m-6 rounded-lg bg-zinc-900/80 flex flex-col items-center justify-center text-white border border-zinc-700/50 backdrop-blur-sm font-sans gap-2 p-6 text-center">
                          <span className="text-[1.8vw] font-bold text-zinc-300">
                            No Videos Linked Yet
                          </span>
                          <span className="text-[1.1vw] text-zinc-500 max-w-[80%]">
                            Tutorial videos for this model are currently
                            unavailable. Please check back later.
                          </span>
                        </div>
                      )}
                      <div className="w-[15.2vw] h-[25.8vw] m-6 flex flex-col gap-4">
                        {sidebarVideos.map((videoUrl, idx) => (
                          <div
                            key={videoUrl}
                            className="h-[8.4vw] w-full rounded-lg overflow-hidden relative cursor-pointer group border border-zinc-800 hover:border-zinc-500 transition-all duration-300"
                            onClick={() => setActiveVideoUrl(videoUrl)}
                          >
                            {/* We can use vimeo's player in non-autoplay mode for thumbnails or simple overlay */}
                            <iframe
                              title={`vimeo-player-sidebar-${idx}`}
                              src={videoUrl}
                              className="w-full h-full pointer-events-none"
                              frameBorder="0"
                              scrolling="no"
                            />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                              <div className="w-[2vw] h-[2vw] rounded-full bg-white/20 group-hover:bg-white/80 group-hover:scale-110 flex items-center justify-center backdrop-blur-sm transition-all duration-300">
                                <svg
                                  className="w-[0.8vw] h-[0.8vw] text-white group-hover:text-black fill-current"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Fill empty spaces with placeholder if sidebar videos are less than 3 */}
                        {sidebarVideos.length === 0 && mainVideoSrc && (
                          <div className="h-full w-full flex flex-col items-center justify-center text-zinc-500 text-[1.1vw] bg-zinc-950/40 rounded-lg border border-dashed border-zinc-800 p-4 text-center font-sans">
                            <span>Single Video Tutorial</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <img
                  src={
                    language === "en"
                      ? "/img/dialog/Button - Subscribe - English_converted.avif"
                      : "/img/dialog/Button - Subscribe - Spanish_converted.avif"
                  }
                  className="absolute inset-0 w-full pointer-events-none"
                  alt=""
                />
                <img
                  src={
                    language === "en"
                      ? "/img/dialog/Button - buy video - English_converted.avif"
                      : "/img/dialog/Button - buy video - Spanish_converted.avif"
                  }
                  className="absolute inset-0 w-full pointer-events-none"
                  alt=""
                />
                <img
                  src={
                    language === "en"
                      ? "/img/dialog/Button - comments - English_converted.avif"
                      : "/img/dialog/Button - comments - spanish_converted.avif"
                  }
                  className="absolute inset-0 w-full pointer-events-none"
                  alt=""
                />
                {/* Close icon */}
                <img
                  src="/img/dialog/button - close_converted.avif"
                  alt="close"
                  className="absolute top-[3%] right-[3%] w-[58%] hover:brightness-110 transition select-none pointer-events-none"
                />
                <div
                  className="absolute inset-0 left-auto right-12 top-6 h-[3.5vw] w-[3.5vw] cursor-pointer"
                  onClick={closeDialog}
                />
              </div>
            </div>
          );
        })()}
    </div>
  );
}
