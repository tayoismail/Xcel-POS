"use client";

import { CategoriesManager } from "@/components/dashboard/settings/categories-manager";
import { ProductImport } from "@/components/dashboard/settings/product-import";
import { UsersManager } from "@/components/dashboard/settings/users-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Role = "OWNER" | "MANAGER" | "STAFF";

export function SettingsTabs({
  role,
  currentUserId,
}: {
  role: Role;
  currentUserId: string;
}) {
  const isOwner = role === "OWNER";

  return (
    <Tabs defaultValue={isOwner ? "users" : "categories"} className="gap-4">
      <TabsList>
        {isOwner ? <TabsTrigger value="users">Users</TabsTrigger> : null}
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="import">Import products</TabsTrigger>
      </TabsList>

      {isOwner ? (
        <TabsContent value="users">
          <UsersManager currentUserId={currentUserId} />
        </TabsContent>
      ) : null}
      <TabsContent value="categories">
        <CategoriesManager />
      </TabsContent>
      <TabsContent value="import">
        <ProductImport />
      </TabsContent>
    </Tabs>
  );
}
