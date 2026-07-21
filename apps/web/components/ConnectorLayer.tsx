"use client";

import { useEffect, useState } from "react";
import { useConnectorGeometry, type ConnectorTarget, type MeasuredConnector } from "../hooks/useConnectorGeometry";
import { connectorStyle } from "../styles/connectorStyle";
import { inkedPathData } from "./connectors/inkedPath";

function Connector({ measurement }: { measurement: MeasuredConnector }) {
  const [displayed, setDisplayed] = useState(measurement);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (displayed.mentionId === measurement.mentionId) {
      setDisplayed(measurement);
      return;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayed(measurement);
      setVisible(true);
      return;
    }
    setVisible(false);
    const timer = window.setTimeout(() => {
      setDisplayed(measurement);
      window.requestAnimationFrame(() => setVisible(true));
    }, connectorStyle.fadeMs / 2);
    return () => window.clearTimeout(timer);
  }, [displayed.mentionId, measurement]);

  const paths = connectorStyle.variant === "inked"
    ? inkedPathData(displayed.connectorId, displayed.path)
    : [displayed.path];

  return (
    <g
      data-connector-for={displayed.assetId}
      data-connector-anchor={displayed.mentionId}
      style={{
        opacity: visible ? connectorStyle.opacity : 0,
        transition: `opacity ${connectorStyle.fadeMs / 2}ms ease`,
      }}
    >
      {paths.map((path, index) => (
        <path
          key={index}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={connectorStyle.strokeWidth}
          strokeLinecap="round"
          markerEnd={index === paths.length - 1 ? "url(#connector-arrow)" : undefined}
        />
      ))}
    </g>
  );
}

export default function ConnectorLayer({ targets }: { targets: ConnectorTarget[] }) {
  const measurements = useConnectorGeometry(targets);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 h-screen w-screen"
      data-connector-layer
      style={{ color: "var(--connector-ink, currentColor)" }}
    >
      <defs>
        <marker
          id="connector-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth={connectorStyle.arrowSize}
          markerHeight={connectorStyle.arrowSize}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 7 4 L 0 7" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </marker>
      </defs>
      {measurements.map((measurement) => (
        <Connector key={measurement.assetId} measurement={measurement} />
      ))}
    </svg>
  );
}
