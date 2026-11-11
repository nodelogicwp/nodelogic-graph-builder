# Requirements Document

## Introduction

Ta specyfikacja definiuje cztery nowe funkcjonalności dla wtyczki NodeLogic Graph Builder, wykryte podczas pracy nad website estimator calculator. Rozszerzenia obejmują nowe node'y do manipulacji tablicami, wsparcie dla elementów DOM w payload, oraz mechanizmy komunikacji między poziomami grafów (podgraf ↔ graf główny).

## Glossary

- **Node**: Podstawowy element w grafie NodeLogic - węzeł przetwarzający dane z inputami i outputami
- **Graph**: Zestaw połączonych node'ów tworzących logikę
- **Subgraph**: Podgraf - zagnieżdżony poziom grafu wykonywany wewnątrz node'a (np. w For Each)
- **Event**: Zdarzenie w systemie eventów NodeLogic (kliknięcie, hover, timer itp.)
- **Payload_Node**: Istniejący node przekazujący dane z wyższego poziomu grafu do podgrafu
- **Element**: Referencja do elementu DOM (np. button, input, div)
- **Array**: Tablica/lista wartości
- **Index**: Pozycja elementu w tablicy (liczba całkowita, zero-based)
- **Loop_Item**: Aktualny element w iteracji (używany w For Each, Map, Filter)
- **Event_Store**: Globalny rejestr eventów (window.eventStore) przechowujący stany zdarzeń
- **For_Each**: Istniejący node iterujący po elementach tablicy
- **Triggered_Count**: Licznik uruchomień eventu (eventValue.triggeredCount)
- **Schedule_Recalculation**: Funkcja wyzwalająca ponowne przeliczenie całego grafu

## Requirements

### Requirement 1: Array Get Item by Index

**User Story:** Jako twórca grafu, chcę wyciągnąć pojedynczy element z tablicy na podstawie indexu, aby móc pracować z konkretnym elementem bez potrzeby iteracji po całej tablicy.

#### Acceptance Criteria

1. THE Array_Get_Item_Node SHALL accept an Array input and an Index input
2. WHEN a valid Array and Index are provided, THE Array_Get_Item_Node SHALL return the element at the specified position
3. WHEN the Index is negative, THE Array_Get_Item_Node SHALL treat it as counting from the end of the array (Index -1 returns last element, -2 returns second-to-last, etc.)
4. WHEN the Index is out of bounds (Index >= array length OR Index < -array length), THE Array_Get_Item_Node SHALL return undefined
5. WHEN the Array input is not an array, THE Array_Get_Item_Node SHALL return undefined
6. WHEN the Index input is not a valid number, THE Array_Get_Item_Node SHALL convert it to 0 and return the first element
7. WHEN the Index is a decimal number, THE Array_Get_Item_Node SHALL floor it to the nearest integer
8. THE Array_Get_Item_Node SHALL support all data types as array elements (text, number, boolean, object, element references)

### Requirement 2: Payload Node Element Type Support

**User Story:** Jako twórca grafu, chcę przekazywać referencje do elementów DOM przez Payload Node do podgrafu, aby móc operować na tych samych elementach na różnych poziomach grafu.

#### Acceptance Criteria

1. THE Payload_Node SHALL accept "element" as a valid type for its "value" input (second input after index)
2. WHEN an Element reference is provided with type "element", THE Payload_Node SHALL preserve the live DOM reference without conversion
3. WHEN the Payload_Node receives an Element reference, THE Payload_Node SHALL pass it to the subgraph unchanged
4. WHEN an Element reference from Payload_Node is used in subgraph __nodeEvent calls, THE __nodeEvent function SHALL accept it as a valid element parameter
5. THE Payload_Node with Element type SHALL support the same element resolution as __nodeEvent (live references, IDs, selectors)
6. WHEN the provided value is not a valid Element reference and type is "element", THE Payload_Node SHALL return null
7. THE Payload_Node SHALL maintain backward compatibility with existing types (text, number, boolean, array, object)

### Requirement 3: First Event Collector from Subgraph

**User Story:** Jako twórca grafu, chcę zbierać pierwszy event z wielu równoległych podgrafów i reagować na niego z jego zawartością, aby móc implementować logikę "wyścigu" między różnymi ścieżkami.

#### Acceptance Criteria

1. THE First_Event_Collector_Node SHALL accept an Array input for iteration (like For Each)
2. THE First_Event_Collector_Node SHALL execute a subgraph body for each array element in parallel
3. WHEN any subgraph instance triggers an event, THE First_Event_Collector_Node SHALL capture the event and its payload
4. WHEN the first event is captured, THE First_Event_Collector_Node SHALL ignore subsequent events from other subgraph instances in the same iteration cycle
5. THE First_Event_Collector_Node SHALL provide __nodeLoopItem and __nodeLoopIndex variables to the subgraph (same as For Each)
6. THE First_Event_Collector_Node SHALL output the payload from the first triggered event
7. WHEN the event payload contains multiple values, THE First_Event_Collector_Node SHALL output all values from that payload
8. WHEN no event is triggered from any subgraph instance, THE First_Event_Collector_Node SHALL output undefined
9. THE First_Event_Collector_Node SHALL reset its state on each recalculation to allow new "first event" detection
10. THE First_Event_Collector_Node SHALL support events from __nodeEvent, __nodeHoverEvent, __nodeCustomEvent, and __nodeTimerEvent
11. WHEN multiple events trigger simultaneously, THE First_Event_Collector_Node SHALL return the event from the lowest index item

### Requirement 4: Multi-Event Aggregator from Subgraphs

**User Story:** Jako twórca grafu, chcę zbierać i agregować eventy ze wszystkich podgrafów oraz łączyć je z kontekstem wyższego poziomu, aby móc tworzyć złożone interakcje między poziomami grafu.

#### Acceptance Criteria

1. THE Multi_Event_Aggregator_Node SHALL accept an Array input for iteration (like For Each)
2. THE Multi_Event_Aggregator_Node SHALL execute a subgraph body for each array element
3. THE Multi_Event_Aggregator_Node SHALL collect events from ALL subgraph instances
4. WHEN subgraph events are collected, THE Multi_Event_Aggregator_Node SHALL sum their triggeredCount values
5. THE Multi_Event_Aggregator_Node SHALL output an aggregated event object with the combined triggeredCount
6. THE Multi_Event_Aggregator_Node SHALL provide __nodeLoopItem and __nodeLoopIndex variables to subgraphs (same as For Each)
7. THE Multi_Event_Aggregator_Node SHALL allow the subgraph to access variables from higher graph levels
8. WHEN higher-level elements are referenced in the subgraph, THE Multi_Event_Aggregator_Node SHALL resolve them correctly
9. THE Multi_Event_Aggregator_Node SHALL support combining subgraph events with events from higher graph levels
10. WHEN no events are triggered from any subgraph, THE Multi_Event_Aggregator_Node SHALL output an event object with triggeredCount = 0
11. THE Multi_Event_Aggregator_Node SHALL create a unique eventKey for the aggregated event
12. THE Multi_Event_Aggregator_Node SHALL update the aggregated triggeredCount on each recalculation
13. THE Multi_Event_Aggregator_Node SHALL support events from __nodeEvent, __nodeHoverEvent, __nodeCustomEvent, and __nodeTimerEvent
