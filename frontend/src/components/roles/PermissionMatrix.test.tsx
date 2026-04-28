import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PermissionMatrix, { Permissions } from './PermissionMatrix';

function harness(initial: Permissions = {}) {
  let snapshot: Permissions = initial;
  const onChange = jest.fn((next: Permissions) => {
    snapshot = next;
  });
  const view = render(<PermissionMatrix value={snapshot} onChange={onChange} />);
  return {
    onChange,
    rerender: (next: Permissions) =>
      view.rerender(<PermissionMatrix value={next} onChange={onChange} />),
  };
}

describe('PermissionMatrix', () => {
  it('renders canonical resources and actions even when value is empty', () => {
    harness({});
    // Canonical resource
    expect(screen.getByText(/^test cases$/i)).toBeInTheDocument();
    // Canonical action header
    expect(screen.getAllByText(/^create$/i).length).toBeGreaterThan(0);
  });

  it('discovers and surfaces non-canonical resources/actions from value', () => {
    harness({ widgets: ['frobnicate'] });
    expect(screen.getByText(/^widgets$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^frobnicate$/i).length).toBeGreaterThan(0);
  });

  it('checking a cell emits the new permissions object', () => {
    const { onChange } = harness({});
    fireEvent.click(screen.getByLabelText('test_cases read'));
    expect(onChange).toHaveBeenCalledWith({ test_cases: ['read'] });
  });

  it('unchecking the only action for a resource removes the resource entry', () => {
    const { onChange } = harness({ users: ['read'] });
    fireEvent.click(screen.getByLabelText('users read'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('row checkbox toggles every action for that resource', () => {
    const { onChange } = harness({});
    fireEvent.click(screen.getByLabelText(/Toggle all users actions/i));
    const call = onChange.mock.calls.at(-1)![0] as Permissions;
    expect(call.users).toBeDefined();
    expect(call.users.length).toBeGreaterThan(0);
    // All canonical actions should be set.
    expect(call.users).toEqual(expect.arrayContaining(['create', 'read', 'update', 'delete']));
  });
});
