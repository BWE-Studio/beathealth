import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";

interface FamilyMemberPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: {
    id: string;
    relationship: string;
    can_view: boolean;
    can_nudge: boolean;
    member?: {
      full_name: string;
      email: string;
    };
  };
  onSave: (linkId: string, updates: {
    relationship?: string;
    can_view?: boolean;
    can_nudge?: boolean;
  }) => void;
  isUpdating?: boolean;
}

export const FamilyMemberPermissionsDialog = ({
  open,
  onOpenChange,
  member,
  onSave,
  isUpdating,
}: FamilyMemberPermissionsDialogProps) => {
  const { t } = useLanguage();
  const [relationship, setRelationship] = useState(member.relationship || "");
  const [canView, setCanView] = useState(member.can_view ?? true);
  const [canNudge, setCanNudge] = useState(member.can_nudge ?? true);

  const handleSave = () => {
    onSave(member.id, {
      relationship,
      can_view: canView,
      can_nudge: canNudge,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("family.managePermissions")}</DialogTitle>
          <DialogDescription>
            {t("family.updatePermissions").replace("{name}", member.member?.full_name || member.member?.email || "")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Relationship */}
          <div className="space-y-2">
            <Label htmlFor="relationship">{t("family.relationship")}</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger id="relationship">
                <SelectValue placeholder={t("family.selectRelationship")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">{t("family.parent")}</SelectItem>
                <SelectItem value="child">{t("family.child")}</SelectItem>
                <SelectItem value="spouse">{t("family.spouse")}</SelectItem>
                <SelectItem value="sibling">{t("family.sibling")}</SelectItem>
                <SelectItem value="grandparent">{t("family.grandparent")}</SelectItem>
                <SelectItem value="grandchild">{t("family.grandchild")}</SelectItem>
                <SelectItem value="other">{t("family.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Permissions */}
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
            <h4 className="text-sm font-semibold">{t("family.accessPermissions")}</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="can-view" className="text-sm font-normal">
                  {t("family.viewHealthData")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("family.viewHealthDesc")}
                </p>
              </div>
              <Switch
                id="can-view"
                checked={canView}
                onCheckedChange={setCanView}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="can-nudge" className="text-sm font-normal">
                  {t("family.sendReminders")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("family.sendRemindersDesc")}
                </p>
              </div>
              <Switch
                id="can-nudge"
                checked={canNudge}
                onCheckedChange={setCanNudge}
              />
            </div>
          </div>

          {/* Security Notice */}
          <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <strong>{t("family.privacyNotice")}</strong> {t("family.privacyNoticeText")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? t("common.saving") : t("profile.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
