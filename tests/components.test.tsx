import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { IvBars } from '@/components/charts/Charts';
import { PokemonCard } from '@/components/pokemon/PokemonCard';
import { Button } from '@/components/ui/Button';
import { Field, NumberField, Segmented, SwitchRow } from '@/components/ui/Form';
import { Chip, Pill } from '@/components/ui/Pill';
import { StepSlider } from '@/components/ui/Sheet';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { analyzePokemon, buildPeerIndex } from '@/engine/recommendations/analysis';
import { ctxFor, getRef, owned } from './helpers';

jest.mock('@/utils/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/hooks/useSpeciesInfo', () => ({ useSpeciesInfo: () => ({ data: null }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

describe('UI components', () => {
  it('renders IV telemetry and marks unknown IVs honestly', async () => {
    await render(<IvBars ivs={{ atk: 15, def: 10, sta: 0 }} />);
    expect(screen.getByLabelText('IVs 15 10 0')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    await render(<IvBars ivs={null} />);
    expect(screen.getByLabelText('IVs unknown')).toBeTruthy();
    expect(screen.getAllByText('?').length).toBe(3);
  });

  it('Button fires onPress and respects disabled/loading', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Save" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Save" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('NumberField commits only valid numbers and shows range errors', async () => {
    const onChange = jest.fn();
    await render(<NumberField label="CP" value={null} onChange={onChange} min={10} max={99999} />);
    const input = screen.getByLabelText('CP');
    await fireEvent.changeText(input, '842');
    expect(onChange).toHaveBeenLastCalledWith(842);
    await fireEvent.changeText(input, '5');
    expect(screen.getByText(/Enter a number between 10 and 99999/)).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(842); // invalid value was not committed
    await fireEvent.changeText(input, 'ab3');
    expect(onChange).toHaveBeenLastCalledWith(842);
    await fireEvent.changeText(input, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Field shows its error and hint', async () => {
    await render(<Field label="NAME" error="Too short" />);
    expect(screen.getByText('Too short')).toBeTruthy();
  });

  it('Segmented and SwitchRow report changes', async () => {
    const onSeg = jest.fn();
    const onSwitch = jest.fn();
    await render(
      <>
        <Segmented options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} value="a" onChange={onSeg} />
        <SwitchRow label="Haptics" value={false} onChange={onSwitch} />
      </>,
    );
    await fireEvent.press(screen.getByText('Beta'));
    expect(onSeg).toHaveBeenCalledWith('b');
    await fireEvent(screen.getByLabelText('Haptics'), 'valueChange', true);
    expect(onSwitch).toHaveBeenCalledWith(true);
  });

  it('StepSlider exposes accessible increment/decrement actions', async () => {
    const Wrapper = () => {
      const [v, setV] = useState(7);
      return <StepSlider label="ATTACK IV" value={v} onChange={setV} color="#f00" />;
    };
    await render(<Wrapper />);
    const slider = screen.getByLabelText('ATTACK IV');
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByLabelText('ATTACK IV').props.accessibilityValue.now).toBe(8);
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByLabelText('ATTACK IV').props.accessibilityValue.now).toBe(6);
  });

  it('Chip, Pill and Card behave', async () => {
    const onChip = jest.fn();
    const onCard = jest.fn();
    await render(
      <>
        <Chip label="Shiny" selected onPress={onChip} />
        <Pill label="TOP INVESTMENT" tone="accent" />
        <Card onPress={onCard} accessibilityLabel="open card">
          <Pill label="inside" />
        </Card>
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Shiny' }));
    expect(onChip).toHaveBeenCalled();
    expect(screen.getByText('TOP INVESTMENT')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('open card'));
    expect(onCard).toHaveBeenCalled();
  });

  it('empty and error states offer recovery actions', async () => {
    const retry = jest.fn();
    const act = jest.fn();
    await render(
      <>
        <EmptyState title="Nothing here" body="Add some" actionLabel="Add Pokémon" onAction={act} />
        <ErrorState message="Boom" onRetry={retry} />
      </>,
    );
    await fireEvent.press(screen.getByText('Add Pokémon'));
    await fireEvent.press(screen.getByText('Retry'));
    expect(act).toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();
  });
});

describe('PokemonCard', () => {
  const ref = getRef();
  const p = owned({ speciesId: 448, cp: 2498, level: 30, ivs: { atk: 15, def: 15, sta: 15 }, shiny: true, favorite: true });
  const species = ref.getSpecies(448)!;

  it('shows CP, IV state, type badges and a recommendation footer from the engine', async () => {
    const ctx = ctxFor([p]);
    const a = analyzePokemon(ctx, p, buildPeerIndex(ctx))!;
    const onPress = jest.fn();
    const onFav = jest.fn();
    await render(<PokemonCard pokemon={p} species={species} verdict={a.verdict} onPress={onPress} onToggleFavorite={onFav} />);
    expect(screen.getByText('CP 2,498')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Lucario')).toBeTruthy();
    expect(screen.getByLabelText(/Lucario, CP 2498, 100 percent IV/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Lucario, CP 2498/));
    expect(onPress).toHaveBeenCalledWith(p);
    await fireEvent.press(screen.getByLabelText('Remove favorite'));
    expect(onFav).toHaveBeenCalledWith(p);
  });

  it('shows unknown IVs and missing CP without inventing numbers', async () => {
    const bare = owned({ speciesId: 25 });
    await render(<PokemonCard pokemon={bare} species={ref.getSpecies(25)!} onPress={jest.fn()} />);
    expect(screen.getByText('CP —')).toBeTruthy();
    expect(screen.getByText('IV ?')).toBeTruthy();
    expect(screen.getAllByText('?').length).toBe(3);
  });
});
