export type Lang = "vi" | "en";

export interface GuideItem { id: number; title: string; url: string; lang: string }

export interface AppItem {
  id: number;
  slug: string;
  name: string;
  url: string | null;
  locked: boolean;
  host: string;
  desc_vi: string;
  desc_en: string;
  access_level: "public" | "member";
  featured: boolean;
  guides: GuideItem[];
}

export interface GroupItem {
  id: number;
  slug: string;
  code: string;
  icon: string;
  name_vi: string;
  name_en: string;
  desc_vi: string;
  desc_en: string;
  apps: AppItem[];
}

export interface DemoItem {
  id: number;
  title_vi: string;
  title_en: string;
  url: string;
  desc_vi: string;
  desc_en: string;
  platform: "youtube" | "linkedin" | "facebook" | "drive" | "web";
  youtube_id: string | null;
  app_slug: string | null;
}

export interface CourseItem { id: number; title_vi: string; title_en: string; url: string; desc_vi: string; desc_en: string }

export interface LinkItem { id: number; kind: string; label_vi: string; label_en: string; url: string }

export interface Catalog {
  version: string | null;
  access_mode: "open" | "restricted";
  groups: GroupItem[];
  guides: GuideItem[];
  demos: DemoItem[];
  courses: CourseItem[];
  links: LinkItem[];
}

/** Shape of backend/app/seed/catalog.seed.json (and of admin export). */
export interface Seed {
  groups: Array<Omit<GroupItem, "id" | "apps"> & {
    visible?: boolean;
    apps: Array<{ slug: string; name: string; url: string; desc_vi: string; desc_en: string;
      access_level?: "public" | "member"; featured?: boolean; visible?: boolean;
      guides?: Array<{ title: string; url: string; lang?: string; visible?: boolean }> }>;
  }>;
  demos?: Array<{ title_vi: string; title_en: string; url: string; desc_vi?: string; desc_en?: string; app_slug?: string | null; visible?: boolean }>;
  courses?: Array<{ title_vi: string; title_en: string; url: string; desc_vi?: string; desc_en?: string; visible?: boolean }>;
  links?: Array<{ kind: string; label_vi: string; label_en: string; url: string; visible?: boolean }>;
}
