# Scoped modal scroll-lock regression

Source927845c5a3cf6755f94a219d8c9cf0060774fd58. Actual320x480 touch emulation, CDP gestures, disposable fresh unlocked fixture; zero POST requests. All four native PNGs opened and viewed.

StudioDialog now snapshots the document/body inline overflow values, uses the existing modal/history helper, locks both scroll containers for that component's lifetime, and restores the previous values on cleanup. It does not change the common Discovery helper or any other modal/page.

Measured before: bodyauto, htmlscroll, window.scrollY80, Team width288. While open: both hidden. Backdrop drag x4,y420→180 leaves window.scrollY80. Internal touch scroll moves dialog-body0→170; Save remains hit-test reachable. Outer dialog bounds do not change. Escape restores prior overflow, scrollY80, width288 and opener focus. A nested rename confirmation cancelled with Escape leaves Studio's background lock in place. Browser Back then dismisses Studio and restores the original values. StrictMode's paired effect setup/cleanup was active in the dev runtime.

The additional no-clip native200% Idea/Next/progress PNGs are1440x757 physical pixels, CSS720x378, DPR2, visualViewport.scale1. They replace the excluded full-page native capture artifact.
