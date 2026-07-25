import { ExternalLink, Wallet, WalletMinimal } from 'lucide-react';
import { useUnitBalance, useUnits } from '../../queries/useSettlement';
import { hashscanUrl } from '../../lib/hashscan';
import type { Unit } from '../../types/settlement';

function UnitRow({ unit }: { unit: Unit }) {
  const balQ = useUnitBalance(unit._id, unit.hederaAccountId);
  return (
    <div className="px-3 py-2 border-b border-line/60 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink truncate">{unit._id}</span>
          {unit.humanBacked ? (
            <span className="text-[8px] uppercase tracking-wider text-green border border-green/60 px-1">
              human · {unit.humanBackingLevel}
            </span>
          ) : (
            <span className="text-[8px] uppercase tracking-wider text-red border border-red/60 px-1">
              bot
            </span>
          )}
        </div>
        {unit.hederaAccountId ? (
          <a
            href={hashscanUrl('account', unit.hederaAccountId)}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-muted hover:text-cyan flex items-center gap-1"
            title="Account on HashScan"
          >
            {unit.hederaAccountId} <ExternalLink size={8} />
          </a>
        ) : (
          <span className="text-[9px] text-muted">no wallet — never payable</span>
        )}
      </div>
      <div className="text-right shrink-0">
        {unit.hederaAccountId ? (
          <>
            <div className="text-sm font-bold text-green tabular-nums">
              {balQ.data ? balQ.data.balance : '…'}
            </div>
            <div className="text-[8px] uppercase tracking-wider text-muted">defpoint</div>
          </>
        ) : (
          <WalletMinimal size={14} className="text-muted" />
        )}
      </div>
    </div>
  );
}

/** DEFPOINT balances per unit, live from the mirror node. */
export function UnitBalancesPanel() {
  const units = useUnits().data ?? [];
  return (
    <div className="border border-line bg-panel font-mono">
      <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
        <Wallet size={11} className="text-green" /> Unit balances
      </div>
      {units.length === 0 && (
        <div className="p-3 text-[10px] text-muted">no units onboarded yet</div>
      )}
      {units.map((u) => (
        <UnitRow key={u._id} unit={u} />
      ))}
    </div>
  );
}
