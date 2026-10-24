# Quick check-in pending geometry

Actual 320 x 480 capture with a labeled 1200ms synthetic transport delay exposed the CTA wrapping to a new line when its label changed. No hosted latency claim is made.

Idle rectangle: x130.25/y436, width123.78/height44. Pending rectangle: x71/y470, width154.20/height44. [Idle](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/admin-quick-check-in-layout/before-idle-320.png), [pending](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/admin-quick-check-in-layout/before-pending-320.png). Both native PNGs were opened and inspected.

The scoped CSS gives only this CTA a 132px fixed basis and width, with 12px type and 8px/12px padding. Both labels fit without changing row geometry. Actual post-fix browser capture is pending root integration.
