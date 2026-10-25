import { askDriver } from '@/mcp/tools/askDriver';
import { askProvider } from '@/mcp/tools/askProvider';
import { askSite } from '@/mcp/tools/askSite';
import { findBackupDrivers } from '@/mcp/tools/findBackupDrivers';
import { findRoadside } from '@/mcp/tools/findRoadside';
import { getOrderContext } from '@/mcp/tools/getOrderContext';
import { getTime } from '@/mcp/tools/getTime';
import { listFacts } from '@/mcp/tools/listFacts';
import { recordInterpretation } from '@/mcp/tools/recordInterpretation';
import { recordNote } from '@/mcp/tools/recordNote';
import { searchFerries } from '@/mcp/tools/searchFerries';
import { searchHotels } from '@/mcp/tools/searchHotels';
import { searchTrains } from '@/mcp/tools/searchTrains';
import type { ControlTool } from '@/mcp/types';

// Registry of every tool the `control` MCP server can expose; add new tools here.
export const controlTools: ControlTool[] = [
  getTime,
  recordNote,
  getOrderContext,
  listFacts,
  searchFerries,
  searchTrains,
  searchHotels,
  findRoadside,
  findBackupDrivers,
  askDriver,
  askSite,
  askProvider,
  recordInterpretation,
];
