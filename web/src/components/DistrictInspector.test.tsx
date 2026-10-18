import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DistrictInspector } from './DistrictInspector';
import { electoralLayerById } from '../layers/electoralLayers';
import type { ElectoralSelection } from '../elections/electoralData';
const geometry: GeoJSON.Polygon = {type:'Polygon',coordinates:[[[-65,44],[-64,44],[-64,45],[-65,44]]]};
describe('district evidence', () => {
  it('labels party bars and preserves the election boundary caveat', () => {
    const selection:ElectoralSelection={layer:electoralLayerById['provincial-results-2024'],feature:{type:'Feature',geometry,properties:{ED_NO:'01',ED_NAME:'Synthetic district',MLA:'Fixture candidate',PARTY:'PC',PC_Votes:101,Liberal_Votes:100,NDP_Votes:20,Green_Votes:5,Independent_Votes:0,Rejected:3,Declined:1,Total:230,PctVoterTurnout:45}}};
    render(<DistrictInspector selection={selection} onClose={vi.fn()} night={false} />);
    expect(screen.getByText('1 votes · 0.44 points')).toBeInTheDocument();
    expect(screen.getByText('Turnout of listed electors')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText(/new district has no separate 2024 result/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Poll-by-poll spreadsheet'})).toHaveAttribute('href',expect.stringContaining('42PGE_PollbyPoll'));
  });
  it('shows MP snapshot dates without presenting caucus as election party', () => {
    render(<DistrictInspector selection={{layer:electoralLayerById['federal-ridings-2025'],feature:{type:'Feature',geometry,properties:{FED_NUM:'12001',ED_NAMEE:'Acadie—Annapolis'}}}} onClose={vi.fn()} night={false} />);
    expect(screen.getByRole('link',{name:"Chris d'Entremont"})).toHaveAttribute('href',expect.stringContaining('ourcommons.ca'));
    expect(screen.getByText(/This is not party at election/)).toBeInTheDocument();
    expect(screen.queryByText('Turnout of listed electors')).not.toBeInTheDocument();
  });
});
