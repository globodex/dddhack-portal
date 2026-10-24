# Desktop organizer refinement

final result: passed

The desktop portraits now measure50.0% of their previous diameters within CSS subpixel rounding. The section uses50.84% of its former height at1440px and54.05% at1024px. Labels remain readable and mobile/portrait geometry is unchanged. All accepted native screenshots were opened and inspected.

## Specification and source

The compact desktop composition starts at width1100px, or landscape width1000px. Existing portrait and subdesktop landscape rules remain. Keep the four original photos, circular rings, cylinders, links, WAAPI entrance, offscreen cancellation and reduced-motion behavior.

Each new portrait is half its original four-column grid width, derived from the original available space and gaps. Tubes grow naturally from portraits and labels. Section top padding is28px, the heading has natural height and the row follows after20px. Names are19–22px, roles17px and partner text16px. There is no transform scaling or viewport-based tube minimum.

Implementation commits: `9bb0c3902bbb5b22bbdc97d8b2d1a12358608db2`, `9837507ee6535271e92cea3951ce70aee0b01c5e`, `69ee2775d6562988d341fdee8e602bd31725ab89`. Author and committer were explicitly verified as Parampreet Singh <rubercuber.30@gmail.com>.

Before runtime: `244d68febfea4a7ba7ff5966001310db107c7828`. After runtime: `182c2bd2077d139a7b5f50b89e9730e5961e397c`. Rendered organizer CSS matches the final owned source exactly by SHA-256.

## Measured result

| Viewport | Portrait before → after | Tube height before → after | Section height before → after |
| --- | ---: | ---: | ---: |
|1440x900|306.22 →153.09px|557.42 →304.36px|811.95 →412.83px|
|1024x768|216.67 →108.33px|470 →297.98px|724 →391.34px|
|768x1024|164px unchanged|164px unchanged|905.31px unchanged|
|390x844|117px unchanged|117px unchanged|700.80px unchanged|

At1440/1024, computed tube minimum height is0px and all name, role and partner text stays inside its column. The entire row shares its natural content height. No text or document horizontal overflow was observed.

## Steps checked

| Step | Check | Health |
| --- | --- | --- |
|1|Fresh before1440 and1024, actual dimensions and all original decoded portraits|Passed|
|2|After desktop1440 and1024,50% portrait widths, natural tube/section sizing, readable copy|Passed|
|3|Portrait768 and mobile390, original circles, rows, spacing and labels|Passed|
|4|Four normal entrance animations per viewport, offscreen cancellation and reduced-motion stop|Passed|
|5|Native viewport and component images opened; same-scale comparisons checked|Passed|

The initial1440before frame caught late chapter hydration after the geometry read. It is explicitly rejected. The replacement waits Home/chapter hydration, decoded images, completed entrance and stable scrolling. Full viewport captures include the preceding FAQ and footer; component captures show the organizer section's exact bounds. Mobile full viewport images are the primary regression evidence.

The pass covers this organizer change. A separate sign-in menu hydration defect was found during the combined job and fixed in `e4a8d9d`; its integrated verification remains separate. No authentication, data, provider, deployment or asset changes were made. This local visual check does not establish full accessibility compliance, physical-device behavior or hosted performance.

[Evidence index](../evidence/organizer-desktop-refinement/README.md), [before report](../evidence/organizer-desktop-refinement/before/report.json), [after report](../evidence/organizer-desktop-refinement/after/report.json).
