'use client';
import { SlidersHorizontal } from 'lucide-react';
import { Card, SectionHeading } from '../ui';

/**
 * The connector service does not cover Smart Control yet, so the app keeps its
 * existing behaviour. This tab is deliberately read-only until it does.
 */
export default function SmartControlTab() {
  return (
    <div className="space-y-5">
      <div>
        <SectionHeading title="Smart control" />
        <p className="mt-1 text-sm text-neutral-600">
          Device-level control is not part of the connector service yet, so this screen keeps the
          app&apos;s existing behaviour rather than pretending to drive hardware.
        </p>
      </div>
      <Card className="flex items-start gap-3 p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">Nothing to configure here</p>
          <p className="mt-1 text-sm text-neutral-600">
            Optimiser actions still flow through Recommend → Approve → Automate, and the connector
            only ever reads device data. When Solis and Octopus control endpoints land, they will be
            wired here.
          </p>
        </div>
      </Card>
    </div>
  );
}
