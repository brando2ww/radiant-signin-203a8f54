"use client";

import React, { useState, type ReactNode } from "react";
import {
  Search as SearchIcon,
  Dashboard,
  Task,
  Folder,
  Calendar as CalendarIcon,
  UserMultiple,
  Analytics,
  DocumentAdd,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  AddLarge,
  Filter,
  Time,
  InProgress,
  CheckmarkOutline,
  Flag,
  Archive,
  View,
  Report,
  StarFilled,
  Group,
  ChartBar,
  FolderOpen,
  Share,
  CloudUpload,
  Security,
  Notification,
  Integration,
  OverflowMenuVertical,
} from "@carbon/icons-react";

const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

/* ----------------------------- Brand / Logos ----------------------------- */

function InterfacesLogoSquare({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md bg-neutral-50"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.6} height={size * 0.45} viewBox="0 0 33 22" fill="none">
        <rect x="0" y="0" width="33" height="5.5" rx="0.5" fill="#0a0a0a" />
        <rect x="6" y="8.25" width="21" height="5.5" rx="0.5" fill="#0a0a0a" />
        <rect x="0" y="16.5" width="33" height="5.5" rx="0.5" fill="#0a0a0a" />
      </svg>
    </div>
  );
}

function BrandBadge() {
  return (
    <div className="flex items-center gap-2.5 px-4 pt-4">
      <InterfacesLogoSquare size={24} />
      <span className="font-['Lexend:Regular',_sans-serif] text-[15px] font-medium text-neutral-50">
        Interfaces
      </span>
    </div>
  );
}

/* --------------------------------- Avatar -------------------------------- */

function AvatarCircle({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-400"
      style={{ width: size, height: size }}
    >
      <UserIcon size={size * 0.5} />
    </div>
  );
}

/* ------------------------------ Search Input ----------------------------- */

function SearchContainer({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-transparent px-3 py-2">
        <span className="text-neutral-400">
          <SearchIcon size={16} />
        </span>
        <input
          type="text"
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-50 placeholder:text-neutral-400 leading-[20px]"
          tabIndex={isCollapsed ? -1 : 0}
        />
      </div>
    </div>
  );
}

/* --------------------------- Types / Content Map -------------------------- */

interface MenuItemT {
  icon?: React.ReactNode;
  label: string;
  hasDropdown?: boolean;
  isActive?: boolean;
  children?: MenuItemT[];
}
interface MenuSectionT {
  title: string;
  items: MenuItemT[];
}
interface SidebarContent {
  title: string;
  sections: MenuSectionT[];
}

const subIconSize = 14;
const itemIconSize = 16;

function getSidebarContent(activeSection: string): SidebarContent {
  const contentMap: Record<string, SidebarContent> = {
    dashboard: {
      title: "Dashboard",
      sections: [
        {
          title: "Dashboard Types",
          items: [
            { icon: <View size={itemIconSize} />, label: "Overview", isActive: true },
            {
              icon: <Dashboard size={itemIconSize} />,
              label: "Executive Summary",
              hasDropdown: true,
              children: [
                { label: "Revenue Overview" },
                { label: "Key Performance Indicators" },
                { label: "Strategic Goals Progress" },
                { label: "Department Highlights" },
              ],
            },
            {
              icon: <Report size={itemIconSize} />,
              label: "Operations Dashboard",
              hasDropdown: true,
              children: [
                { label: "Project Timeline" },
                { label: "Resource Allocation" },
                { label: "Team Performance" },
                { label: "Capacity Planning" },
              ],
            },
            {
              icon: <Analytics size={itemIconSize} />,
              label: "Financial Dashboard",
              hasDropdown: true,
              children: [
                { label: "Budget vs Actual" },
                { label: "Cash Flow Analysis" },
                { label: "Expense Breakdown" },
                { label: "Profit & Loss Summary" },
              ],
            },
          ],
        },
        {
          title: "Report Summaries",
          items: [
            {
              icon: <Report size={itemIconSize} />,
              label: "Weekly Reports",
              hasDropdown: true,
              children: [
                { label: "Team Productivity: 87% ↑" },
                { label: "Project Completion: 12/15" },
                { label: "Budget Utilization: 73%" },
                { label: "Client Satisfaction: 4.6/5" },
              ],
            },
            {
              icon: <StarFilled size={itemIconSize} />,
              label: "Monthly Insights",
              hasDropdown: true,
              children: [
                { label: "Revenue Growth: +15.3%" },
                { label: "New Clients: 24" },
                { label: "Team Expansion: 8 hires" },
                { label: "Cost Reduction: 7.2%" },
              ],
            },
            {
              icon: <View size={itemIconSize} />,
              label: "Quarterly Analysis",
              hasDropdown: true,
              children: [
                { label: "Market Position: Improved" },
                { label: "ROI: 23.4%" },
                { label: "Customer Retention: 92%" },
                { label: "Innovation Index: 8.7/10" },
              ],
            },
          ],
        },
        {
          title: "Business Intelligence",
          items: [
            {
              icon: <ChartBar size={itemIconSize} />,
              label: "Performance Metrics",
              hasDropdown: true,
              children: [
                { label: "Sales Conversion: 34.2%" },
                { label: "Lead Response Time: 2.3h" },
                { label: "Customer Lifetime Value: $4,280" },
                { label: "Churn Rate: 3.1%" },
              ],
            },
            {
              icon: <Analytics size={itemIconSize} />,
              label: "Predictive Analytics",
              hasDropdown: true,
              children: [
                { label: "Q4 Revenue Forecast: $2.4M" },
                { label: "Resource Demand: High" },
                { label: "Market Trends: Positive" },
                { label: "Risk Assessment: Low" },
              ],
            },
          ],
        },
      ],
    },

    tasks: {
      title: "Tasks",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { icon: <AddLarge size={itemIconSize} />, label: "New task" },
            { icon: <Filter size={itemIconSize} />, label: "Filter tasks" },
          ],
        },
        {
          title: "My Tasks",
          items: [
            {
              icon: <Time size={itemIconSize} />,
              label: "Due today",
              hasDropdown: true,
              children: [
                { icon: <Task size={subIconSize} />, label: "Review design mockups" },
                { icon: <Task size={subIconSize} />, label: "Update documentation" },
                { icon: <Task size={subIconSize} />, label: "Test new feature" },
              ],
            },
            {
              icon: <InProgress size={itemIconSize} />,
              label: "In progress",
              hasDropdown: true,
              children: [
                { icon: <Task size={subIconSize} />, label: "Implement user auth" },
                { icon: <Task size={subIconSize} />, label: "Database migration" },
              ],
            },
            {
              icon: <CheckmarkOutline size={itemIconSize} />,
              label: "Completed",
              hasDropdown: true,
              children: [
                { icon: <CheckmarkOutline size={subIconSize} />, label: "Fixed login bug" },
                { icon: <CheckmarkOutline size={subIconSize} />, label: "Updated dependencies" },
                { icon: <CheckmarkOutline size={subIconSize} />, label: "Code review completed" },
              ],
            },
          ],
        },
        {
          title: "Other",
          items: [
            {
              icon: <Flag size={itemIconSize} />,
              label: "Priority tasks",
              hasDropdown: true,
              children: [
                { icon: <Flag size={subIconSize} />, label: "Security update" },
                { icon: <Flag size={subIconSize} />, label: "Client presentation" },
              ],
            },
            { icon: <Archive size={itemIconSize} />, label: "Archived" },
          ],
        },
      ],
    },

    projects: {
      title: "Projects",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { icon: <AddLarge size={itemIconSize} />, label: "New project" },
            { icon: <Filter size={itemIconSize} />, label: "Filter projects" },
          ],
        },
        {
          title: "Active Projects",
          items: [
            {
              icon: <Folder size={itemIconSize} />,
              label: "Web Application",
              hasDropdown: true,
              children: [
                { icon: <Task size={subIconSize} />, label: "Frontend development" },
                { icon: <Task size={subIconSize} />, label: "API integration" },
                { icon: <Task size={subIconSize} />, label: "Testing & QA" },
              ],
            },
            {
              icon: <Folder size={itemIconSize} />,
              label: "Mobile App",
              hasDropdown: true,
              children: [
                { icon: <Task size={subIconSize} />, label: "UI/UX design" },
                { icon: <Task size={subIconSize} />, label: "Native development" },
              ],
            },
          ],
        },
        {
          title: "Other",
          items: [
            { icon: <CheckmarkOutline size={itemIconSize} />, label: "Completed" },
            { icon: <Archive size={itemIconSize} />, label: "Archived" },
          ],
        },
      ],
    },

    calendar: {
      title: "Calendar",
      sections: [
        {
          title: "Views",
          items: [
            { icon: <CalendarIcon size={itemIconSize} />, label: "Month view" },
            { icon: <CalendarIcon size={itemIconSize} />, label: "Week view" },
            { icon: <CalendarIcon size={itemIconSize} />, label: "Day view" },
          ],
        },
        {
          title: "Events",
          items: [
            {
              icon: <Time size={itemIconSize} />,
              label: "Today's events",
              hasDropdown: true,
              children: [
                { icon: <Time size={subIconSize} />, label: "Team standup (9:00 AM)" },
                { icon: <Time size={subIconSize} />, label: "Client call (2:00 PM)" },
                { icon: <Time size={subIconSize} />, label: "Project review (4:00 PM)" },
              ],
            },
            { icon: <CalendarIcon size={itemIconSize} />, label: "Upcoming events" },
          ],
        },
        {
          title: "Quick Actions",
          items: [
            { icon: <AddLarge size={itemIconSize} />, label: "New event" },
            { icon: <Share size={itemIconSize} />, label: "Share calendar" },
          ],
        },
      ],
    },

    teams: {
      title: "Teams",
      sections: [
        {
          title: "My Teams",
          items: [
            {
              icon: <Group size={itemIconSize} />,
              label: "Development Team",
              hasDropdown: true,
              children: [
                { icon: <UserIcon size={subIconSize} />, label: "John Doe (Lead)" },
                { icon: <UserIcon size={subIconSize} />, label: "Jane Smith" },
                { icon: <UserIcon size={subIconSize} />, label: "Mike Johnson" },
              ],
            },
            {
              icon: <Group size={itemIconSize} />,
              label: "Design Team",
              hasDropdown: true,
              children: [
                { icon: <UserIcon size={subIconSize} />, label: "Sarah Wilson" },
                { icon: <UserIcon size={subIconSize} />, label: "Tom Brown" },
              ],
            },
          ],
        },
        {
          title: "Quick Actions",
          items: [
            { icon: <AddLarge size={itemIconSize} />, label: "Invite member" },
            { icon: <UserMultiple size={itemIconSize} />, label: "Manage teams" },
          ],
        },
      ],
    },

    analytics: {
      title: "Analytics",
      sections: [
        {
          title: "Reports",
          items: [
            { icon: <Report size={itemIconSize} />, label: "Performance report" },
            { icon: <CheckmarkOutline size={itemIconSize} />, label: "Task completion" },
            { icon: <ChartBar size={itemIconSize} />, label: "Team productivity" },
          ],
        },
        {
          title: "Insights",
          items: [
            {
              icon: <Analytics size={itemIconSize} />,
              label: "Key metrics",
              hasDropdown: true,
              children: [
                { icon: <CheckmarkOutline size={subIconSize} />, label: "Tasks completed: 24" },
                { icon: <Time size={subIconSize} />, label: "Avg. completion time: 2.5d" },
                { icon: <ChartBar size={subIconSize} />, label: "Team efficiency: 87%" },
              ],
            },
          ],
        },
      ],
    },

    files: {
      title: "Files",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { icon: <CloudUpload size={itemIconSize} />, label: "Upload file" },
            { icon: <FolderOpen size={itemIconSize} />, label: "New folder" },
          ],
        },
        {
          title: "Recent Files",
          items: [
            {
              icon: <Folder size={itemIconSize} />,
              label: "Recent documents",
              hasDropdown: true,
              children: [
                { icon: <DocumentAdd size={subIconSize} />, label: "Project proposal.pdf" },
                { icon: <DocumentAdd size={subIconSize} />, label: "Meeting notes.docx" },
                { icon: <DocumentAdd size={subIconSize} />, label: "Design specs.figma" },
              ],
            },
            { icon: <Share size={itemIconSize} />, label: "Shared with me" },
          ],
        },
        {
          title: "Organization",
          items: [
            { icon: <FolderOpen size={itemIconSize} />, label: "All folders" },
            { icon: <Archive size={itemIconSize} />, label: "Archived files" },
          ],
        },
      ],
    },

    settings: {
      title: "Settings",
      sections: [
        {
          title: "Account",
          items: [
            { icon: <UserIcon size={itemIconSize} />, label: "Profile settings" },
            { icon: <Security size={itemIconSize} />, label: "Security" },
            { icon: <Notification size={itemIconSize} />, label: "Notifications" },
          ],
        },
        {
          title: "Workspace",
          items: [
            {
              icon: <SettingsIcon size={itemIconSize} />,
              label: "Preferences",
              hasDropdown: true,
              children: [
                { icon: <SettingsIcon size={subIconSize} />, label: "Theme settings" },
                { icon: <Time size={subIconSize} />, label: "Time zone" },
                { icon: <Notification size={subIconSize} />, label: "Default notifications" },
              ],
            },
            { icon: <Integration size={itemIconSize} />, label: "Integrations" },
          ],
        },
      ],
    },
  };

  return contentMap[activeSection] || contentMap.tasks;
}

/* ---------------------------- Left Icon Nav Rail -------------------------- */

function IconNavButton({
  children,
  isActive = false,
  onClick,
  title,
}: {
  children: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        "flex h-10 w-10 items-center justify-center rounded-md text-neutral-500 transition-colors " +
        (isActive
          ? "bg-neutral-800 text-neutral-50"
          : "hover:bg-neutral-900 hover:text-neutral-200")
      }
      style={{
        transitionTimingFunction: softSpringEasing,
        transitionDuration: "200ms",
      }}
    >
      {children}
    </button>
  );
}

function IconNavigation({
  activeSection,
  onSectionChange,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
}) {
  const navItems = [
    { id: "dashboard", icon: <Dashboard size={18} />, label: "Dashboard" },
    { id: "tasks", icon: <Task size={18} />, label: "Tasks" },
    { id: "projects", icon: <Folder size={18} />, label: "Projects" },
    { id: "calendar", icon: <CalendarIcon size={18} />, label: "Calendar" },
    { id: "teams", icon: <UserMultiple size={18} />, label: "Teams" },
    { id: "analytics", icon: <Analytics size={18} />, label: "Analytics" },
    { id: "files", icon: <DocumentAdd size={18} />, label: "Files" },
  ];

  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 py-4">
      {/* Logo */}
      <div className="mb-2 flex h-10 w-10 items-center justify-center">
        <InterfacesLogoSquare size={28} />
      </div>

      {/* Navigation Icons */}
      <div className="flex flex-col items-center gap-1">
        {navItems.map((item) => (
          <IconNavButton
            key={item.id}
            title={item.label}
            isActive={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
          >
            {item.icon}
          </IconNavButton>
        ))}
      </div>

      <div className="flex-1" />

      {/* Bottom section */}
      <div className="flex flex-col items-center gap-2 pb-1">
        <IconNavButton
          title="Settings"
          isActive={activeSection === "settings"}
          onClick={() => onSectionChange("settings")}
        >
          <SettingsIcon size={18} />
        </IconNavButton>
        <AvatarCircle size={32} />
      </div>
    </div>
  );
}

/* ------------------------------ Right Sidebar ----------------------------- */

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div className="flex justify-center px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand panel"
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-50"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <h2 className="font-['Lexend:Medium',_sans-serif] text-[22px] font-medium text-neutral-50 leading-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label="Collapse panel"
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-50"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}

/* ------------------------------ Menu Elements ---------------------------- */

function MenuItem({
  item,
  isExpanded,
  onToggle,
  onItemClick,
  isCollapsed,
}: {
  item: MenuItemT;
  isExpanded?: boolean;
  onToggle?: () => void;
  onItemClick?: () => void;
  isCollapsed?: boolean;
}) {
  const handleClick = () => {
    if (item.hasDropdown && onToggle) onToggle();
    else onItemClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      tabIndex={isCollapsed ? -1 : 0}
      className={
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors " +
        (item.isActive
          ? "bg-neutral-800 text-neutral-50"
          : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-50")
      }
      style={{
        transitionTimingFunction: softSpringEasing,
        transitionDuration: "180ms",
      }}
    >
      <span className="flex h-4 w-4 items-center justify-center text-neutral-300">
        {item.icon}
      </span>
      <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[14px] leading-[20px] truncate">
        {item.label}
      </span>
      {item.hasDropdown && (
        <span
          className="text-neutral-400 transition-transform"
          style={{
            transitionTimingFunction: softSpringEasing,
            transitionDuration: "200ms",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDownIcon size={14} />
        </span>
      )}
    </button>
  );
}

function SubMenuItem({ item, onItemClick }: { item: MenuItemT; onItemClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onItemClick}
      className="flex w-full items-center gap-2 rounded-md py-1.5 pl-10 pr-3 text-left text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
    >
      {item.icon && <span className="flex h-3 w-3 items-center justify-center">{item.icon}</span>}
      <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[13px] leading-[18px] truncate">
        {item.label}
      </span>
    </button>
  );
}

function MenuSection({
  section,
  expandedItems,
  onToggleExpanded,
  isCollapsed,
}: {
  section: MenuSectionT;
  expandedItems: Set<string>;
  onToggleExpanded: (itemKey: string) => void;
  isCollapsed?: boolean;
}) {
  return (
    <div className="px-2 py-2">
      <div className="px-3 pb-1.5 pt-2 font-['Lexend:Regular',_sans-serif] text-[12px] text-neutral-500 leading-[16px]">
        {section.title}
      </div>

      {section.items.map((item, index) => {
        const itemKey = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(itemKey);
        return (
          <div key={itemKey} className="flex flex-col">
            <MenuItem
              item={item}
              isExpanded={isExpanded}
              onToggle={() => onToggleExpanded(itemKey)}
              onItemClick={() => console.log(`Clicked ${item.label}`)}
              isCollapsed={isCollapsed}
            />
            {isExpanded && item.children && !isCollapsed && (
              <div className="mt-0.5 flex flex-col">
                {item.children.map((child, childIndex) => (
                  <SubMenuItem
                    key={childIndex}
                    item={child}
                    onItemClick={() => console.log(`Clicked ${child.label}`)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailSidebar({ activeSection }: { activeSection: string }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const content = getSidebarContent(activeSection);

  const toggleExpanded = (itemKey: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const toggleCollapse = () => setIsCollapsed((s) => !s);

  return (
    <div
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-neutral-800"
      style={{
        width: isCollapsed ? 0 : 300,
        transitionProperty: "width",
        transitionDuration: "280ms",
        transitionTimingFunction: softSpringEasing,
      }}
    >
      {!isCollapsed && <BrandBadge />}

      <SectionTitle
        title={content.title}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      {!isCollapsed && <SearchContainer isCollapsed={isCollapsed} />}

      <div className="flex-1 overflow-y-auto">
        {!isCollapsed &&
          content.sections.map((section, index) => (
            <MenuSection
              key={`${activeSection}-${index}`}
              section={section}
              expandedItems={expandedItems}
              onToggleExpanded={toggleExpanded}
              isCollapsed={isCollapsed}
            />
          ))}
      </div>

      {!isCollapsed && (
        <div className="border-t border-neutral-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <AvatarCircle size={36} />
            <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-50 leading-[20px]">
              Text content
            </span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              aria-label="More"
            >
              <OverflowMenuVertical size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

function TwoLevelSidebar() {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
      <IconNavigation activeSection={activeSection} onSectionChange={setActiveSection} />
      <DetailSidebar activeSection={activeSection} />
    </div>
  );
}

/* ------------------------------- Root Frame ------------------------------ */

export function Frame760() {
  return (
    <div className="flex h-screen items-stretch bg-black p-3">
      <TwoLevelSidebar />
    </div>
  );
}

export const AdminSidebar = Frame760;
export default Frame760;
