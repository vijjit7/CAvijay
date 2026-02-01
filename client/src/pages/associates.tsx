import AuditLayout from "@/components/layout/audit-layout";
import { useAudit } from "@/lib/audit-context";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function AssociatesPage() {
  const { associates } = useAudit();
  const { user } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newAssociate, setNewAssociate] = useState({
    name: '',
    username: '',
    password: '',
  });
  const { toast } = useToast();

  const handleDelete = async (id: string, name: string) => {
    if (id === 'ADMIN') {
      toast({
        title: "Cannot Delete",
        description: "Admin user cannot be deleted.",
        variant: "destructive",
      });
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/associates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Associate Deleted",
          description: `${name} has been removed from the system.`,
        });
        window.location.reload();
      } else {
        const error = await response.json();
        toast({
          title: "Delete Failed",
          description: error.error || "Failed to delete associate.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while deleting the associate.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newAssociate.name || !newAssociate.username || !newAssociate.password) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch('/api/associates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newAssociate),
      });

      if (response.ok) {
        toast({
          title: "Associate Created",
          description: `${newAssociate.name} has been added successfully.`,
        });
        setIsAddOpen(false);
        setNewAssociate({ name: '', username: '', password: '' });
        window.location.reload();
      } else {
        const error = await response.json();
        toast({
          title: "Creation Failed",
          description: error.error || "Failed to create associate.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while creating the associate.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const isAdmin = user?.id === 'ADMIN' || user?.isAdmin;

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Associates Management</h1>
            <p className="text-muted-foreground">Manage verification officers and their access</p>
          </div>
          
          {isAdmin && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-associate">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Associate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Associate</DialogTitle>
                  <DialogDescription>
                    Create a new verification officer account.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Enter full name"
                      value={newAssociate.name}
                      onChange={(e) => setNewAssociate(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="Enter username"
                      value={newAssociate.username}
                      onChange={(e) => setNewAssociate(prev => ({ ...prev, username: e.target.value }))}
                      data-testid="input-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={newAssociate.password}
                      onChange={(e) => setNewAssociate(prev => ({ ...prev, password: e.target.value }))}
                      data-testid="input-password"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={isAdding} data-testid="button-confirm-add">
                    {isAdding ? "Creating..." : "Create Associate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {associates.map((associate) => (
            <Card key={associate.id} className="p-4" data-testid={`card-associate-${associate.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={associate.avatar || ''} alt={associate.name} />
                    <AvatarFallback>{associate.name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold" data-testid={`text-name-${associate.id}`}>{associate.name}</h3>
                    <p className="text-sm text-muted-foreground">{associate.role}</p>
                    <p className="text-xs text-muted-foreground">@{associate.username}</p>
                  </div>
                </div>
                
                {isAdmin && associate.id !== 'ADMIN' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-${associate.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Associate?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete <strong>{associate.name}</strong>? 
                          This action cannot be undone. All reports associated with this user will remain but the user will no longer be able to log in.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(associate.id, associate.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deletingId === associate.id}
                        >
                          {deletingId === associate.id ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </Card>
          ))}
        </div>

        {associates.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No associates found.</p>
          </Card>
        )}
      </div>
    </AuditLayout>
  );
}
