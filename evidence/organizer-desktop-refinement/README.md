# Desktop organizer size evidence

Before `244d68febfea4a7ba7ff5966001310db107c7828`; after `182c2bd2077d139a7b5f50b89e9730e5961e397c`. Final owned organizer source `69ee2775d6562988d341fdee8e602bd31725ab89`; rendered CSS hash matches it exactly. All native PNGs use local synthetic fixtures and were inspected.

- [1440before native viewport](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/before/organizers-1440x900.png)
- [1440after native viewport](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-1440x900.png)
- [1440after complete component](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-component-1440x900.png)
- [1024before native viewport](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/before/organizers-1024x768.png)
- [1024after native viewport](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-1024x768.png)
- [1024after complete component](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-component-1024x768.png)
- [768portrait unchanged](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-768x1024.png)
- [390mobile unchanged](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/after/organizers-390x844.png)
- [1440same-scale comparison](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/organizer-comparison-1440.png)
- [1024same-scale comparison](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/organizer-desktop-refinement/organizer-comparison-1024.png)

The comparisons are labelled composites from the actual native captures, resized to the same scale in each pair. Gray space under the shorter after image belongs to the comparison canvas. Original native files remain above.

Portrait diameters measure306.22→153.09px at1440 and216.67→108.33px at1024. Section heights measure811.95→412.83px and724→391.34px. Names remain19–22px, roles17px and partner text16px.768portrait circles remain164px;390mobile circles remain117px. All four original photos, rings, cylinders, links and animation logic remain.

[Before measurements](before/report.json), [after measurements and checks](after/report.json), [full QA](../../docs/ORGANIZER_DESKTOP_REFINEMENT_QA.md). The initial late-hydration1440frame is rejected and recorded in the before report. Component crops are actual browser screenshots; mobile full viewport frames provide the clean header and complete rows.
