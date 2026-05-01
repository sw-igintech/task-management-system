import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import type { Person } from '../types';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';

interface PeopleManagerProps {
  people: Person[];
  onAddPerson: (name: string, email?: string) => void;
}

export function PeopleManager({ people, onAddPerson }: PeopleManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddPerson(name.trim(), email.trim() || undefined);
    setName('');
    setEmail('');
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Users size={14} />
        People ({people.length})
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="People / Team">
        <div className="flex flex-col gap-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {people.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No people added yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Name</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500">{p.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <UserPlus size={14} />
              Add New Person
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Full name *"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <Input
                placeholder="Email (optional)"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!name.trim()}>
                Add Person
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
