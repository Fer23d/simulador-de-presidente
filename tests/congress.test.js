import test from 'node:test';
import assert from 'node:assert/strict';

import { LAW_LABOR_REFORM } from '../src/core/laws.js';
import {
  createCongress,
  getVoteForecast,
  negotiateSupport,
  voteOnLaw,
} from '../src/core/congress.js';

test('creates a 300-seat congress', () => {
  const congress = createCongress(10);

  assert.equal(congress.blocs.reduce((total, bloc) => total + bloc.seats, 0), 300);
});

test('approves a labor law with a favorable simple majority', () => {
  const congress = {
    blocs: [
      { id: 'left', seats: 170, support: 1, negotiated: false, negotiationCost: 0 },
      { id: 'center', seats: 130, support: 0, negotiated: false, negotiationCost: 0 },
    ],
  };

  const result = voteOnLaw(congress, LAW_LABOR_REFORM, 60);

  assert.equal(result.approved, true);
  assert.equal(result.requiredVotes, 151);
});

test('does not approve a law below the majority threshold', () => {
  const congress = {
    blocs: [
      { id: 'left', seats: 150, support: 1, negotiated: false, negotiationCost: 0 },
      { id: 'center', seats: 150, support: 0, negotiated: false, negotiationCost: 0 },
    ],
  };

  assert.equal(voteOnLaw(congress, LAW_LABOR_REFORM, 60).approved, false);
});

test('does not negotiate support without available cash', () => {
  const result = negotiateSupport(createCongress(10), { cash: 0, popularity: 50 }, 'center');

  assert.equal(result.ok, false);
});

test('negotiation increases support only once for a bloc', () => {
  const congress = createCongress(10);
  const first = negotiateSupport(congress, { cash: 20_000_000_000, popularity: 50 }, 'center');
  const second = negotiateSupport(first.congress, first.economy, 'center');

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
});

test('forecasts votes from current blocs and popularity', () => {
  const forecast = getVoteForecast(createCongress(10), 55);

  assert.ok(forecast.votesFor >= 0);
  assert.equal(forecast.requiredVotes, 151);
});
