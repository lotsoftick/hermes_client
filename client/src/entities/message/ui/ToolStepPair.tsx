import { useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import {
  ExpandMore,
  TerminalOutlined,
  DescriptionOutlined,
  EditOutlined,
  LanguageOutlined,
  SearchOutlined,
  AutoAwesomeOutlined,
  BuildOutlined,
  type SvgIconComponent,
} from '@mui/icons-material';
import type { ToolCall } from '../api';
import { prettyArgs, summarizeInput } from '../lib/toolStepFormatting';
import ToolStepCodeFrame from './ToolStepCodeFrame';
import ToolStepTrailing from './ToolStepTrailing';

interface ToolStepPairProps {
  call: ToolCall;
  idx: number;
}

/** Map a raw Hermes tool name to a friendly label + icon. */
function toolMeta(name: string): { label: string; Icon: SvgIconComponent } {
  const n = name.toLowerCase();
  if (/(terminal|shell|bash|exec|command)/.test(n)) return { label: 'Terminal', Icon: TerminalOutlined };
  if (/(write|create|edit|patch|append)/.test(n)) return { label: 'Edit file', Icon: EditOutlined };
  if (/(read|view|cat|open|file_)/.test(n)) return { label: 'Read file', Icon: DescriptionOutlined };
  if (/browser/.test(n)) return { label: 'Browser', Icon: LanguageOutlined };
  if (/(search|grep|find)/.test(n)) return { label: 'Search', Icon: SearchOutlined };
  if (/skill/.test(n)) return { label: 'Skill', Icon: AutoAwesomeOutlined };
  return { label: name, Icon: BuildOutlined };
}

const emptyHint = (label: string) => (
  <Typography
    variant="caption"
    color="text.secondary"
    sx={{ display: 'block', pl: 2.5, fontStyle: 'italic', opacity: 0.7 }}
  >
    {label}
  </Typography>
);

export default function ToolStepPair({ call, idx }: ToolStepPairProps) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = toolMeta(call.name);
  const summary = summarizeInput(call.name, call.args);
  const hasArgs = !!call.args && call.args !== '{}';

  return (
    <Box sx={{ mt: idx === 0 ? 0 : 0.5 }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          cursor: 'pointer',
          opacity: 0.8,
          '&:hover': { opacity: 1 },
          minWidth: 0,
        }}
      >
        <Icon sx={{ fontSize: 14, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem', flexShrink: 0 }}>
          {label}
        </Typography>
        {summary && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.8,
              minWidth: 0,
              flex: 1,
            }}
          >
            {summary}
          </Typography>
        )}
        <Box sx={{ flexShrink: 0, ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ToolStepTrailing call={call} />
          <ExpandMore
            sx={{
              fontSize: 14,
              transition: 'transform 0.2s',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </Box>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: 2.5 }}>
          {hasArgs ? <ToolStepCodeFrame>{prettyArgs(call.args)}</ToolStepCodeFrame> : emptyHint('(no arguments)')}
          {call.result !== null ? (
            <>
              {call.result ? <ToolStepCodeFrame>{call.result}</ToolStepCodeFrame> : emptyHint('(no output)')}
              {call.truncated && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25, fontStyle: 'italic', opacity: 0.7 }}
                >
                  output truncated for storage
                </Typography>
              )}
            </>
          ) : (
            emptyHint('(no result captured)')
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
