import rough from "roughjs";
import { connectorStyle } from "../../styles/connectorStyle";
import { stableConnectorSeed } from "./geometry";

const generator = rough.generator();

export function inkedPathData(connectorId: string, path: string): string[] {
  const drawable = generator.path(path, {
    seed: stableConnectorSeed(connectorId),
    roughness: connectorStyle.roughness,
    bowing: connectorStyle.bowing,
    strokeWidth: connectorStyle.strokeWidth,
    disableMultiStroke: true,
    preserveVertices: true,
  });
  return generator.toPaths(drawable).map((item) => item.d);
}
