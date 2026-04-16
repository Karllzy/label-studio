import { isDefined } from "../../utils/utils";
import { NumberCell } from "./NumberCell";

export const PredictionsScoreCell = ({ value, original, ...rest }) => {
  const fallbackScore = original?.predictions?.[0]?.score;
  const score = isDefined(value) ? value : fallbackScore;

  return <NumberCell value={score} original={original} {...rest} />;
};
