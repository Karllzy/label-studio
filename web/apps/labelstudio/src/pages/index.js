import { ProjectsPage } from "./Projects/Projects";
import { HomePage } from "./Home/HomePage";
import { OrganizationPage } from "./Organization";
import { ModelsPage } from "./Organization/Models/ModelsPage";
import { AdminUsersPage } from "./AdminUsers/AdminUsersPage";
import { FF_HOMEPAGE, isFF } from "../utils/feature-flags";
import { pages } from "@humansignal/app-common";

const isSuperuser = window.APP_SETTINGS?.user?.is_superuser === true;

export const Pages = [
  isFF(FF_HOMEPAGE) && HomePage,
  ProjectsPage,
  OrganizationPage,
  ModelsPage,
  isSuperuser && AdminUsersPage,
  pages.AccountSettingsPage,
].filter(Boolean);
