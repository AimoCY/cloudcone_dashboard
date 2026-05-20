import type { Proc } from "../types.js";

export function ProcTable({ title, procs }: { title: string; procs: Proc[] }) {
  return (
    <div className="proc">
      <div className="proc__title">{title}</div>
      <table>
        <thead>
          <tr><th>进程</th><th>PID</th><th>CPU%</th><th>MEM%</th></tr>
        </thead>
        <tbody>
          {procs.map((p) => (
            <tr key={p.pid}>
              <td>{p.name}</td><td>{p.pid}</td>
              <td>{p.cpu_pct.toFixed(1)}</td><td>{p.mem_pct.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
