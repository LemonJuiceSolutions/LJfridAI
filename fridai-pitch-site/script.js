/**
 * FRIDAI - Premium Pitch Deck (GSAP)
 */

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. INITIAL SETUP & SPLITTEXT
    // -------------------------------------------------------------------------
    gsap.registerPlugin();

    // Prepare text elements for animation using SplitType (removed 'words' to drastically fix overflow blocking!)
    let splitTitles = new SplitType('.split-text', { types: 'lines, chars' });
    let splitDesc = new SplitType('.split-lines', { types: 'lines' });

    // Responsive Auto-Wrap handling (Crucial for adaptiveness)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            splitTitles.revert();
            splitDesc.revert();
            splitTitles = new SplitType('.split-text', { types: 'lines, chars' });
            splitDesc = new SplitType('.split-lines', { types: 'lines' });
            document.querySelectorAll('.line').forEach(line => {
                if(!line.parentNode.classList.contains('line-wrapper')) {
                    const wrapper = document.createElement('div');
                    wrapper.classList.add('line-wrapper');
                    wrapper.style.overflow = 'hidden';
                    wrapper.style.display = 'inline-block';
                    wrapper.style.verticalAlign = 'top';
                    line.parentNode.insertBefore(wrapper, line);
                    wrapper.appendChild(line);
                }
            });
            gsap.set('.char', { yPercent: 0 });
            gsap.set('.line .line', { yPercent: 0 });
        }, 200);
    });

    // Custom CSS wrapper for masks
    document.querySelectorAll('.line').forEach(line => {
        const wrapper = document.createElement('div');
        wrapper.style.overflow = 'hidden';
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'top';
        line.parentNode.insertBefore(wrapper, line);
        wrapper.appendChild(line);
    });

    // 2. CUSTOM CURSOR & MAGNETIC EFFECT
    // -------------------------------------------------------------------------
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');
    
    let mx = 0, my = 0, cx = 0, cy = 0;
    
    document.addEventListener('mousemove', (e) => {
        mx = e.clientX;
        my = e.clientY;
        gsap.to(cursor, { x: mx, y: my, duration: 0.1, ease: 'power2.out' });
        
        // Parallax effect for dynamic WOW visual
        const coreImgs = document.querySelectorAll('.global-core-video');
        coreImgs.forEach(img => {
            const speed = 0.5;
            const px = (window.innerWidth / 2 - e.clientX) * speed * 0.05;
            const py = (window.innerHeight / 2 - e.clientY) * speed * 0.05;
            gsap.to(img, { x: px, y: py, duration: 1.5, ease: 'power2.out' });
        });
    });

    // Follower tracking via raf for smoothness
    gsap.ticker.add(() => {
        cx += (mx - cx) * 0.15;
        cy += (my - cy) * 0.15;
        gsap.set(follower, { x: cx, y: cy });
    });

    const magneticElements = document.querySelectorAll('.magnetic, button, a, .border-card, .list-item');
    
    magneticElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.classList.add('hovering');
            follower.classList.add('hovering');
        });
        el.addEventListener('mouseleave', () => {
            cursor.classList.remove('hovering');
            follower.classList.remove('hovering');
            gsap.to(el, { x: 0, y: 0, scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
        });
        
        // Magnetic Pull Logic
        if(el.classList.contains('magnetic')) {
            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const hx = rect.left + rect.width / 2;
                const hy = rect.top + rect.height / 2;
                const dx = (e.clientX - hx) * 0.3;
                const dy = (e.clientY - hy) * 0.3;
                gsap.to(el, { x: dx, y: dy, duration: 0.2, ease: 'power2.out' });
            });
        }
    });

    // 3. SLIDE MANAGER
    // -------------------------------------------------------------------------
    const slides = document.querySelectorAll('.slide');
    const totIdx = document.querySelector('.tot-idx');
    const currIdx = document.querySelector('.curr-idx');
    
    let currentSlide = 0;
    const totalSlides = slides.length;
    let isAnimating = false;
    
    totIdx.textContent = totalSlides.toString().padStart(2, '0');

    // Set initial states
    gsap.set(slides, { autoAlpha: 0, scale: 0.95 });
    gsap.set('.char', { yPercent: 120 });
    gsap.set('.line .line', { yPercent: 120 });
    gsap.set('.fade-up, .stagger-item, .stagger-row td, .data-row, .chart-bar-group', { y: 30, autoAlpha: 0 });
    gsap.set('.fade-in, .hero-logo-wrapper, .kicker, .badge', { autoAlpha: 0 });

    function initSlide(index) {
        slides[index].classList.add('active');
        
        const tl = gsap.timeline();
        const slide = slides[index];

        // --- EVOLVING VISUAL LOGIC (Multi-Video Crossfade) ---
        // I video in background crossfadano opacità e play in base alla slide corrente
        const allVideos = document.querySelectorAll('.slide-video');
        allVideos.forEach(v => v.classList.remove('active-vid'));
        
        const activeVideo = document.getElementById('vid-' + index);
        if (activeVideo) {
            activeVideo.classList.add('active-vid');
            activeVideo.play();
            
            // Effetto accelera/rallenta fluido e poi fermo
            gsap.fromTo(activeVideo, 
                { playbackRate: 3 }, 
                { playbackRate: 1, duration: 2, ease: 'power3.out', onComplete: () => {
                    activeVideo.pause();
                }}
            );
        }

        // Alternanza tema
        const isLight = index % 2 === 1;
        if (isLight) document.body.classList.add('light-theme');
        else document.body.classList.remove('light-theme');

        // Alternanza laterale del pannello video (deve andare col CSS grid)
        // Slide pari (light) → video a sinistra | Slide dispari (dark) → video a destra
        const isRightAligned = index % 2 === 0; // dispari = dark = video destra
        const visualMask = document.querySelector('.visual-mask');
        const targetLeft  = isRightAligned ? 'calc(52% + 2rem)' : '2rem';
        const targetWidth = 'calc(48% - 4rem)';

        gsap.to(visualMask, {
            left: targetLeft,
            width: targetWidth,
            height: '90vh',
            borderRadius: 24,
            opacity: 1,
            duration: 1.2,
            ease: 'power3.inOut'
        });

        // ------------------------------------

        // Ensure slide is visible
        tl.to(slide, { autoAlpha: 1, scale: 1, duration: 1, ease: 'expo.out' }, 0);
        
        // Animate Typography (Titles)
        const chars = slide.querySelectorAll('.char');
        if(chars.length) {
            tl.to(chars, {
                yPercent: 0,
                duration: 0.8,
                stagger: 0.02,
                ease: 'expo.out'
            }, 0.2);
        }

        // Animate Typography (Lines/Desc)
        const lines = slide.querySelectorAll('.hero-desc .line .line, .section-desc .line .line, .center-desc .line .line');
        if(lines.length) {
            tl.to(lines, {
                yPercent: 0,
                duration: 0.8,
                stagger: 0.05,
                ease: 'expo.out'
            }, 0.4);
        }

        // Specific Elements
        const fadeUps = slide.querySelectorAll('.fade-up');
        if(fadeUps.length) tl.to(fadeUps, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.5);
        
        const fadeIn = slide.querySelectorAll('.fade-in, .hero-logo-wrapper, .kicker');
        if(fadeIn.length) tl.to(fadeIn, { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, 0.2);

        const badges = slide.querySelectorAll('.badge');
        if(badges.length) tl.to(badges, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(1.5)' }, 0.6);

        const techNodes = slide.querySelectorAll('.tech-flow-node');
        if(techNodes.length) tl.to(techNodes, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out' }, 0.5);

        const timelineItems = slide.querySelectorAll('.timeline-item');
        if(timelineItems.length) tl.to(timelineItems, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0.4);

        // All Custom Data Components (Cards, Flow Nodes, Timeline, Rows)
        const staggerElements = slide.querySelectorAll('.stagger-item, .data-row, .chart-bar-group, .timeline-item');
        if(staggerElements.length) {
            tl.to(staggerElements, { 
                autoAlpha: 1, 
                y: 0, 
                duration: 0.8, 
                stagger: 0.1, 
                ease: 'power3.out' 
            }, 0.6);
        }

        const table = slide.querySelector('.brutal-table-wrapper');
        if(table) tl.to(table, { autoAlpha: 1, scale: 1, duration: 1, ease: 'expo.out' }, 0.5);

        const tableRows = slide.querySelectorAll('.stagger-row td');
        if(tableRows.length) tl.to(tableRows, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.03, ease: 'power2.out' }, 0.7);

        // Hide hint on last slide
        if (index === totalSlides - 1) {
            gsap.to('.nav-hint-wrapper', { autoAlpha: 0, duration: 0.3 });
        } else {
            gsap.to('.nav-hint-wrapper', { autoAlpha: 1, duration: 0.3 });
        }

        return tl;
    }

    function cleanupSlide(index) {
        const slide = slides[index];
        const tl = gsap.timeline({
            onComplete: () => {
                slide.classList.remove('active');
                gsap.set(slide.querySelectorAll('.char'), { yPercent: 120 });
                gsap.set(slide.querySelectorAll('.line .line'), { yPercent: 120 });
                gsap.set(slide.querySelectorAll('.fade-up, .stagger-item, .stagger-row td, .data-row, .chart-bar-group'), { y: 30, autoAlpha: 0 });
                gsap.set(slide.querySelectorAll('.fade-in, .hero-logo-wrapper, .badge'), { autoAlpha: 0 });
                
                // PERFORMANCE: hard-stop the old video that is now hidden!
                const oldVideo = document.getElementById('vid-' + index);
                if (oldVideo) oldVideo.pause();

                isAnimating = false;
            }
        });

        tl.to(slide, {
            autoAlpha: 0,
            scale: 1.05,
            duration: 0.8,
            ease: 'power3.inOut'
        });

        return tl;
    }

    function goToSlide(index) {
        if (isAnimating || index === currentSlide || index < 0 || index >= totalSlides) return;
        isAnimating = true;

        const prevSlide = currentSlide;
        currentSlide = index;

        // Start playing the NEXT video IMMEDIATELY to mask the transition
        const nextVideo = document.getElementById('vid-' + currentSlide);
        if (nextVideo) nextVideo.play();

        // Update UI
        currIdx.textContent = (currentSlide + 1).toString().padStart(2, '0');

        cleanupSlide(prevSlide);
        
        // Slight delay before bringing in next slide
        setTimeout(() => {
            initSlide(currentSlide);
        }, 400);
    }

    // 4. NAVIGATION CONTROLS
    // -------------------------------------------------------------------------
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
            if (currentSlide < totalSlides - 1) goToSlide(currentSlide + 1);
        } else if (e.key === 'Backspace' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            if (currentSlide > 0) goToSlide(currentSlide - 1);
        }
    });

    // Mouse Wheel (throttled)
    let wheelTimeout;
    document.addEventListener('wheel', (e) => {
        if (isAnimating) return;
        clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
            if (e.deltaY > 50) {
                if (currentSlide < totalSlides - 1) goToSlide(currentSlide + 1);
            } else if (e.deltaY < -50) {
                if (currentSlide > 0) goToSlide(currentSlide - 1);
            }
        }, 50);
    });

    // Touch Swipes
    let touchStartY = 0;
    let touchEndY = 0;
    
    document.addEventListener('touchstart', e => {
        touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    document.addEventListener('touchend', e => {
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, {passive: true});

    function handleSwipe() {
        if (isAnimating) return;
        const diff = touchStartY - touchEndY;
        if (diff > 50 && currentSlide < totalSlides - 1) {
            goToSlide(currentSlide + 1);
        } else if (diff < -50 && currentSlide > 0) {
            goToSlide(currentSlide - 1);
        }
    }

    // Initialize first slide and video autoplay
    setTimeout(() => {
        document.body.classList.remove('loading');
        initSlide(0);
        const video = document.getElementById('global-video');
        if(video) video.play().catch(e => console.log("Autoplay prevented:", e));
    }, 200);

});
