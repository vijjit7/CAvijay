import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubscriptionSummary = {
  associateId: string;
  associateName: string;
  deviceCount: number;
  lastSubscribedAt: string | null;
};

/**
 * Admin-only view listing which associates have enabled new-work push notifications
 * and how many devices each has subscribed. Backed by GET /api/push/subscriptions/summary.
 */
export function PushSubscriptionsSummary() {
  const { data, isLoading, isError } = useQuery<SubscriptionSummary[]>({
    queryKey: ["/api/push/subscriptions/summary"],
  });

  const rows = data ?? [];
  const totalDevices = rows.reduce((sum, r) => sum + r.deviceCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          Notification Subscriptions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn't load notification subscriptions.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No associates have enabled notifications yet.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {rows.length} associate{rows.length === 1 ? "" : "s"} · {totalDevices} device
              {totalDevices === 1 ? "" : "s"} subscribed
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Associate</TableHead>
                  <TableHead className="text-right">Devices</TableHead>
                  <TableHead className="text-right">Last enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.associateId} data-testid={`row-push-sub-${row.associateId}`}>
                    <TableCell className="font-medium">
                      {row.associateName}
                      <span className="ml-2 text-xs text-muted-foreground">{row.associateId}</span>
                    </TableCell>
                    <TableCell className="text-right">{row.deviceCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.lastSubscribedAt
                        ? new Date(row.lastSubscribedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
