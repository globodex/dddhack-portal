import {
  avatarPresets,
  teamPalettes,
  type Palette,
} from "../lib/experience-contract";
const paths = [
  "M18 40a22 22 0 1 0 44 0a22 22 0 1 0-44 0M28 40a12 12 0 1 1 24 0a12 12 0 1 1-24 0M40 10l7 8-7 8-7-8z",
  "M14 15h38L34 40H14zM66 65H28l18-25h20zM22 48l12 17V48zM58 32L46 15v17z",
  "M40 10l12 18-12 12-18-12zM70 40L52 52 40 40l12-18zM40 70L28 52l12-12 18 12zM10 40l18-12 12 12-12 18z",
  "M12 58V34a28 28 0 0 1 56 0v24H56V34a16 16 0 0 0-32 0v24zM34 42h12v24H34z",
  "M12 20l28 20-28 20V44l8-4-8-4zM38 20l28 20-28 20V44l8-4-8-4z",
  "M12 12h24v24H12zM44 12h24v24H44zM12 44h24v24H12zM44 44h12v12H44zM56 56h12v12H56z",
  "M40 12Q67 12 40 40Q12 12 40 12M68 40Q68 68 40 40Q68 12 68 40M40 68Q12 68 40 40Q68 68 40 68M12 40Q12 12 40 40Q12 68 12 40",
  "M12 58h14V42h14V26h14V12h14v28H54v14H40v14H12z",
  "M40 10l29 52H11zM40 28L25 54h30zM40 37l10 17H30z",
  "M12 16h12l44 48H56zM56 16h12L24 64H12zM34 16h12v12H34zM34 52h12v12H34z",
  "M12 68V38a28 28 0 0 1 56 0v30H54V38a14 14 0 0 0-28 0v30zM34 42h12v26H34z",
  "M14 12h10v56H14zM34 12h10v56H34zM54 12h10v56H54zM8 26h64v10H8zM8 46h64v10H8z",
  "M10 54h12v14H10zM28 40h12v28H28zM46 26h12v42H46zM64 12h8v56h-8z",
  "M12 12h56v56H12zM24 24v32h32V24zM34 34h12v12H34z",
  "M10 32q15-28 30 0t30 0v16q-15 28-30 0t-30 0zM10 58q15-28 30 0t30 0v10H10z",
  "M12 12h26v26H12zM42 12h26L42 38zM12 42l26 26H12zM42 42h26v26H42z",
];
export default function TeamAvatar({
  avatar = "orbit",
  palette = "forest",
  size = 64,
}: {
  avatar?: string;
  palette?: string;
  size?: number;
}) {
  const i = Math.max(
    0,
    avatarPresets.indexOf(avatar as (typeof avatarPresets)[number]),
  );
  const colors = teamPalettes[palette as Palette] || teamPalettes.forest;
  return (
    <svg
      className="team-avatar"
      role="img"
      aria-label={`${avatar} team badge`}
      viewBox="0 0 80 80"
      width={size}
      height={size}
      style={{ background: colors.wash, color: colors.ink }}
    >
      <path d={paths[i]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
